import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '@/lib/db'
import { getAppAdminAccess } from '@/lib/app-admin-access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ROLES = ['caretaker', 'esm', 'housing officer', 'admin']

async function requireAdmin() {
  const access = await getAppAdminAccess()
  if (!access.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!access.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!getPgUrl()) return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  return null
}

/**
 * Manage Users list: one row per Clerk account (`users`), joined to staff directory (`people`) when linked.
 * - `id` = users.id (for PATCH /api/admin/users/[id])
 * - `person_id` = people.id when linked (for assignments and person-scoped APIs)
 * - `name` = staff name, or email if staff name blank
 */
export async function GET() {
  const err = await requireAdmin()
  if (err) return err
  try {
    await ensureDatabase()
    const result = await sql`
      SELECT
        u.id,
        u.people_id,
        p.id AS person_id,
        TRIM(COALESCE(NULLIF(TRIM(p.name), ''), NULLIF(TRIM(u.email), ''), '—')) AS name,
        COALESCE(NULLIF(TRIM(u.email), ''), NULLIF(TRIM(p.email), '')) AS email,
        p.role AS role,
        COALESCE(u.is_active, true) AS account_active,
        CASE WHEN p.id IS NULL THEN NULL ELSE COALESCE(p.active, true) END AS staff_directory_active,
        u.created_at
      FROM users u
      LEFT JOIN people p ON p.id = u.people_id
        AND (p.category IS DISTINCT FROM 'issue_recipient' OR p.category IS NULL)
      ORDER BY COALESCE(u.is_active, true) DESC, LOWER(COALESCE(u.email, ''))
    `
    return NextResponse.json(result.rows)
  } catch (e) {
    console.error('Admin users GET:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request) {
  const err = await requireAdmin()
  if (err) return err
  try {
    await ensureDatabase()
    const body = await request.json().catch(() => ({}))
    const name = body.name && String(body.name).trim()
    const email = body.email && String(body.email).trim()
    if (!name || !email) return NextResponse.json({ error: 'name and email are required' }, { status: 400 })
    const role = body.role && ROLES.includes(String(body.role).toLowerCase()) ? String(body.role).toLowerCase() : null
    const id = body.id && String(body.id).trim() ? String(body.id).trim() : `person_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`
    const existing = await sql`
      SELECT id, category FROM people WHERE lower(trim(email)) = lower(trim(${email})) LIMIT 1
    `
    if (existing.rows[0]?.category === 'issue_recipient') {
      return NextResponse.json(
        { error: 'This email is already used as an Issue Recipient. Remove or change the recipient first.' },
        { status: 409 }
      )
    }
    try {
      await sql`
        INSERT INTO people (id, name, email, role, category, active)
        VALUES (${id}, ${name}, ${email}, ${role}, 'staff', true)
      `
    } catch (e) {
      if (e?.code === '23505') {
        await sql`
          UPDATE people SET
            name = ${name},
            role = COALESCE(${role}, role),
            category = CASE WHEN category = 'issue_recipient' THEN category ELSE 'staff' END,
            active = true,
            updated_at = CURRENT_TIMESTAMP
          WHERE lower(trim(email)) = lower(trim(${email})) AND category IS DISTINCT FROM 'issue_recipient'
        `
      } else {
        throw e
      }
    }
    const personRow = (await sql`SELECT id, name, email, role, active FROM people WHERE lower(trim(email)) = lower(trim(${email})) LIMIT 1`).rows[0]
    if (personRow?.id) {
      await sql`
        UPDATE users SET people_id = ${personRow.id}, updated_at = CURRENT_TIMESTAMP
        WHERE lower(trim(email)) = lower(trim(${email})) AND (people_id IS NULL OR people_id = ${personRow.id})
      `
    }
    const merged = (
      await sql`
        SELECT u.id, u.people_id, p.id AS person_id,
          TRIM(COALESCE(NULLIF(TRIM(p.name), ''), NULLIF(TRIM(u.email), ''), '—')) AS name,
          COALESCE(NULLIF(TRIM(u.email), ''), NULLIF(TRIM(p.email), '')) AS email,
          p.role AS role,
          COALESCE(u.is_active, true) AS account_active,
          CASE WHEN p.id IS NULL THEN NULL ELSE COALESCE(p.active, true) END AS staff_directory_active,
          u.created_at
        FROM users u
        LEFT JOIN people p ON p.id = u.people_id
        WHERE u.id = (SELECT id FROM users WHERE lower(trim(email)) = lower(trim(${email})) LIMIT 1)
        LIMIT 1
      `
    ).rows[0]
    if (merged) return NextResponse.json(merged)
    if (personRow) {
      return NextResponse.json({
        id: personRow.id,
        person_id: personRow.id,
        people_id: personRow.id,
        name: personRow.name,
        email: personRow.email,
        role: personRow.role,
        account_active: true,
        staff_directory_active: personRow.active !== false,
        created_at: null,
      })
    }
    return NextResponse.json({ error: 'Person row not found' }, { status: 500 })
  } catch (e) {
    console.error('Admin users POST:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
