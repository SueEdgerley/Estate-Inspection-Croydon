import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { clerkClient } from '@clerk/nextjs/server'
import { ensureDatabase, getPgUrl } from '@/lib/db'
import { getAppAdminAccess } from '@/lib/app-admin-access'
import { normalizeStaffJobTitle } from '@/lib/staff-job-titles'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function requireAdmin() {
  const access = await getAppAdminAccess()
  if (!access.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!access.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!getPgUrl()) return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  return null
}

function primaryEmailFromClerkUser(user) {
  const primaryId = user?.primaryEmailAddressId
  const addresses = Array.isArray(user?.emailAddresses) ? user.emailAddresses : []
  const primary = primaryId ? addresses.find((e) => e?.id === primaryId) : null
  const email = primary?.emailAddress || addresses[0]?.emailAddress
  return typeof email === 'string' && email.trim() ? email.trim().toLowerCase() : null
}

async function findClerkUserByEmail(email) {
  if (!email) return null
  try {
    const client = typeof clerkClient === 'function' ? await clerkClient() : clerkClient
    const result = await client.users.getUserList({ emailAddress: [email], limit: 10 })
    const users = Array.isArray(result?.data) ? result.data : Array.isArray(result) ? result : []
    return users.find((user) => primaryEmailFromClerkUser(user) === email) || users[0] || null
  } catch (e) {
    console.warn('[admin/staff-people] Clerk lookup failed:', e?.message || e)
    return null
  }
}

async function relinkMatchingAppUser({ email, personId, clerkUser }) {
  if (!email || !personId) return null
  const clerkUserId = clerkUser?.id || null
  const clerkEmail = primaryEmailFromClerkUser(clerkUser) || email

  const existing = clerkUserId
    ? await sql`
        SELECT id, clerk_user_id
        FROM users
        WHERE clerk_user_id = ${clerkUserId}
           OR people_id = ${personId}
           OR lower(trim(COALESCE(email, ''))) = ${email}
        ORDER BY
          CASE WHEN clerk_user_id = ${clerkUserId} THEN 0 ELSE 1 END,
          CASE WHEN people_id = ${personId} THEN 0 ELSE 1 END,
          COALESCE(is_active, true) DESC,
          created_at ASC NULLS LAST
        LIMIT 1
      `
    : await sql`
        SELECT id, clerk_user_id
        FROM users
        WHERE people_id = ${personId}
           OR lower(trim(COALESCE(email, ''))) = ${email}
        ORDER BY
          CASE WHEN people_id = ${personId} THEN 0 ELSE 1 END,
          COALESCE(is_active, true) DESC,
          created_at ASC NULLS LAST
        LIMIT 1
      `
  const row = existing.rows[0]

  if (row?.id) {
    await sql`
      UPDATE users
      SET
        clerk_user_id = CASE
          WHEN ${clerkUserId}::text IS NULL THEN clerk_user_id
          WHEN NOT EXISTS (
            SELECT 1 FROM users u2
            WHERE u2.clerk_user_id = ${clerkUserId} AND u2.id IS DISTINCT FROM ${row.id}
          ) THEN ${clerkUserId}
          ELSE clerk_user_id
        END,
        email = COALESCE(${clerkEmail}, email),
        people_id = CASE
          WHEN NOT EXISTS (
            SELECT 1 FROM users u2
            WHERE u2.people_id = ${personId} AND u2.id IS DISTINCT FROM ${row.id}
          ) THEN ${personId}
          ELSE people_id
        END,
        is_active = true,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${row.id}
    `
    return { id: row.id, restored: true, created: false }
  }

  if (!clerkUserId) return null

  const id = crypto.randomUUID()
  await sql`
    INSERT INTO users (id, clerk_user_id, email, system_role, role, people_id, is_active)
    VALUES (${id}, ${clerkUserId}, ${clerkEmail}, 'user', 'user', ${personId}, true)
    ON CONFLICT (clerk_user_id) DO UPDATE SET
      email = COALESCE(EXCLUDED.email, users.email),
      people_id = EXCLUDED.people_id,
      is_active = true,
      updated_at = CURRENT_TIMESTAMP
  `
  return { id, restored: false, created: true }
}

/**
 * People rows usable for estate/block assignments (excludes issue_recipient mailboxes).
 * Separate from `/api/admin/users` (Clerk app accounts).
 */
export async function GET() {
  const err = await requireAdmin()
  if (err) return err
  try {
    await ensureDatabase()
    const result = await sql`
      SELECT id, name, email, role, job_title, COALESCE(active, true) AS active
      FROM people
      WHERE category IS DISTINCT FROM 'issue_recipient'
      ORDER BY LOWER(name), LOWER(email)
    `
    return NextResponse.json(result.rows)
  } catch (e) {
    console.error('[admin/staff-people] GET:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

/**
 * Pre-register a staff person (assignments) before they sign in with Clerk.
 * Writes `people` only — no join to `users` and no `users.people_id` requirement.
 */
export async function POST(request) {
  const err = await requireAdmin()
  if (err) return err
  try {
    await ensureDatabase()
    const body = await request.json().catch(() => ({}))
    const name = body.name && String(body.name).trim()
    const email = body.email && String(body.email).trim().toLowerCase()
    if (!name || !email) return NextResponse.json({ error: 'name and email are required' }, { status: 400 })
    const jobTitleRaw =
      body.job_title != null && String(body.job_title).trim()
        ? String(body.job_title).trim()
        : body.role != null && String(body.role).trim()
          ? String(body.role).trim()
          : null
    const jobTitle = normalizeStaffJobTitle(jobTitleRaw)

    const clerkUser = await findClerkUserByEmail(email)
    const existing = await sql`
      SELECT id, category, COALESCE(active, true) AS active
      FROM people
      WHERE lower(trim(email)) = ${email}
      LIMIT 1
    `
    const row = existing.rows[0]
    if (row?.category === 'issue_recipient') {
      return NextResponse.json(
        { error: 'This email is reserved for an Issue Recipient. Change or remove that contact first.' },
        { status: 409 }
      )
    }

    if (row?.id) {
      await sql`
        UPDATE people
        SET
          name = ${name},
          job_title = ${jobTitle},
          category = CASE WHEN category = 'issue_recipient' THEN category ELSE 'staff' END,
          active = true,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ${row.id}
      `
      const appUser = await relinkMatchingAppUser({ email, personId: row.id, clerkUser })
      const updated = (
        await sql`
          SELECT id, name, email, role, job_title, COALESCE(active, true) AS active
          FROM people WHERE id = ${row.id} LIMIT 1
        `
      ).rows[0]
      return NextResponse.json({ ...updated, restored: row.active === false, app_user: appUser })
    }

    const id = `person_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`
    await sql`
      INSERT INTO people (id, name, email, job_title, category, active)
      VALUES (${id}, ${name}, ${email}, ${jobTitle}, 'staff', true)
    `
    const appUser = await relinkMatchingAppUser({ email, personId: id, clerkUser })
    const created = (
      await sql`
        SELECT id, name, email, role, job_title, COALESCE(active, true) AS active
        FROM people WHERE id = ${id} LIMIT 1
      `
    ).rows[0]
    return NextResponse.json({ ...created, restored: false, app_user: appUser })
  } catch (e) {
    console.error('[admin/staff-people] POST:', e)
    if (e?.code === '23505') {
      return NextResponse.json({ error: 'Email already in use' }, { status: 409 })
    }
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
