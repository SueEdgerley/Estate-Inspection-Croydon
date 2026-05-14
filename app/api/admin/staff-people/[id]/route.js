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

export async function PATCH(request, { params }) {
  const err = await requireAdmin()
  if (err) return err
  const { id } = await params
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  try {
    await ensureDatabase()
    const current = (
      await sql`
        SELECT id, name, email, job_title, active, category
        FROM people
        WHERE id = ${id} AND category IS DISTINCT FROM 'issue_recipient'
        LIMIT 1
      `
    ).rows[0]
    if (!current) return NextResponse.json({ error: 'Staff row not found' }, { status: 404 })

    const body = await request.json().catch(() => ({}))
    const name = body.name !== undefined ? String(body.name).trim() : current.name
    const email = body.email !== undefined ? String(body.email).trim().toLowerCase() : current.email
    const jobTitle =
      body.job_title !== undefined ? normalizeStaffJobTitle(body.job_title) : current.job_title || null
    const active = body.active !== undefined ? Boolean(body.active) : current.active !== false

    if (!name) return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 })
    if (!email) return NextResponse.json({ error: 'email cannot be empty' }, { status: 400 })

    const clash = await sql`
      SELECT id FROM people
      WHERE lower(trim(email)) = lower(trim(${email})) AND id IS DISTINCT FROM ${id}
      LIMIT 1
    `
    if (clash.rows[0]) {
      return NextResponse.json({ error: 'Another staff or recipient record already uses this email' }, { status: 409 })
    }

    await sql`
      UPDATE people
      SET name = ${name},
          email = ${email},
          job_title = ${jobTitle},
          category = CASE WHEN category IS NULL OR category = '' THEN 'staff' ELSE category END,
          active = ${active},
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
    `
    const updated = (
      await sql`
        SELECT id, name, email, role, job_title, COALESCE(active, true) AS active
        FROM people
        WHERE id = ${id}
        LIMIT 1
      `
    ).rows[0]
    return NextResponse.json(updated)
  } catch (e) {
    console.error('[admin/staff-people/:id] PATCH:', e)
    if (e?.code === '23505') {
      return NextResponse.json({ error: 'Email already in use' }, { status: 409 })
    }
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 })
  }
}

export async function DELETE(request, { params }) {
  const err = await requireAdmin()
  if (err) return err
  const { id } = await params
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  try {
    await ensureDatabase()
    const current = (
      await sql`
        SELECT id, email
        FROM people
        WHERE id = ${id} AND category IS DISTINCT FROM 'issue_recipient'
        LIMIT 1
      `
    ).rows[0]
    if (!current) return NextResponse.json({ error: 'Staff row not found' }, { status: 404 })

    const appUser = current.email
      ? (
          await sql`
            SELECT id
            FROM users
            WHERE lower(trim(email)) = lower(trim(${current.email}))
            LIMIT 1
          `
        ).rows[0]
      : null

    if (appUser) {
      return NextResponse.json(
        { error: 'This staff row matches a current app user. Archive legacy Photobook records only.' },
        { status: 409 }
      )
    }

    const updated = await sql`
      UPDATE people
      SET active = false, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id} AND category IS DISTINCT FROM 'issue_recipient'
      RETURNING id
    `
    if (updated.rows.length === 0) return NextResponse.json({ error: 'Staff row not found' }, { status: 404 })
    return NextResponse.json({ ok: true, id: updated.rows[0].id, active: false })
  } catch (e) {
    console.error('[admin/staff-people/:id] DELETE:', e)
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 })
  }
}
