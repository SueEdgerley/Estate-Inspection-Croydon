import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '@/lib/db'
import { getAppAdminAccess } from '@/lib/app-admin-access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const STAFF_JOB_TITLES = [
  'Estate Services Manager',
  'Housing Officer',
  'Caretaker',
  'Resident Representative',
  'Ward Councillor',
  'Repairs Officer',
  'Concierge',
  'Other',
]

function normalizeStaffJobTitle(raw) {
  const value = raw != null ? String(raw).trim() : ''
  if (!value) return null
  return STAFF_JOB_TITLES.find((title) => title.toLowerCase() === value.toLowerCase()) || null
}

async function requireAdmin() {
  const access = await getAppAdminAccess()
  if (!access.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!access.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!getPgUrl()) return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  return null
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

    const existing = await sql`
      SELECT id, category FROM people WHERE lower(trim(email)) = ${email} LIMIT 1
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
      const updated = (
        await sql`
          SELECT id, name, email, role, job_title, COALESCE(active, true) AS active
          FROM people WHERE id = ${row.id} LIMIT 1
        `
      ).rows[0]
      return NextResponse.json(updated)
    }

    const id = `person_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`
    await sql`
      INSERT INTO people (id, name, email, job_title, category, active)
      VALUES (${id}, ${name}, ${email}, ${jobTitle}, 'staff', true)
    `
    const created = (
      await sql`
        SELECT id, name, email, role, job_title, COALESCE(active, true) AS active
        FROM people WHERE id = ${id} LIMIT 1
      `
    ).rows[0]
    return NextResponse.json(created)
  } catch (e) {
    console.error('[admin/staff-people] POST:', e)
    if (e?.code === '23505') {
      return NextResponse.json({ error: 'Email already in use' }, { status: 409 })
    }
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
