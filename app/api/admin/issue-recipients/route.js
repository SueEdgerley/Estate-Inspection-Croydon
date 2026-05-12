import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '@/lib/db'
import { getAppAdminAccess } from '@/lib/app-admin-access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CATEGORY = 'issue_recipient'

function normalizeEmail(value) {
  return value && String(value).trim().toLowerCase()
}

function displayCategory(category) {
  if (category === CATEGORY) return 'Issue recipient'
  if (category === 'staff') return 'Staff'
  return category ? String(category) : 'Person'
}

async function requireAdmin() {
  const access = await getAppAdminAccess()
  if (!access.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!access.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!getPgUrl()) return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  return null
}

export async function GET() {
  const err = await requireAdmin()
  if (err) return err
  try {
    await ensureDatabase()
    const result = await sql`
      SELECT
        id,
        name,
        email,
        category,
        role,
        job_title,
        active,
        created_at
      FROM people
      WHERE COALESCE(active, true) = true
      ORDER BY
        CASE WHEN category = ${CATEGORY} THEN 0 ELSE 1 END,
        LOWER(name),
        LOWER(email)
    `
    return NextResponse.json(
      result.rows.map((row) => ({
        ...row,
        recipient_type: row.category === CATEGORY ? 'routing_mailbox' : 'existing_person',
        category_label: displayCategory(row.category),
      }))
    )
  } catch (e) {
    console.error('issue-recipients GET:', e)
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
    const email = normalizeEmail(body.email)
    if (!name || !email) return NextResponse.json({ error: 'name and email are required' }, { status: 400 })
    const existing = await sql`
      SELECT id, category FROM people WHERE lower(trim(email)) = ${email} LIMIT 1
    `
    const existingRow = existing.rows[0]
    if (existingRow?.id) {
      await sql`
        UPDATE people
        SET
          name = ${name},
          email = ${email},
          active = true,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ${existingRow.id}
      `
      const row = (
        await sql`
          SELECT id, name, email, category, role, job_title, active
          FROM people
          WHERE id = ${existingRow.id}
          LIMIT 1
        `
      ).rows[0]
      return NextResponse.json({
        ...row,
        reused: true,
        recipient_type: row.category === CATEGORY ? 'routing_mailbox' : 'existing_person',
        category_label: displayCategory(row.category),
      })
    }
    const id =
      body.id && String(body.id).trim()
        ? String(body.id).trim()
        : `recipient_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`
    await sql`
      INSERT INTO people (id, name, email, role, category, active)
      VALUES (${id}, ${name}, ${email}, null, ${CATEGORY}, true)
    `
    const row = (
      await sql`
        SELECT id, name, email, category, role, job_title, active
        FROM people
        WHERE id = ${id}
        LIMIT 1
      `
    ).rows[0]
    return NextResponse.json({
      ...row,
      reused: false,
      recipient_type: 'routing_mailbox',
      category_label: displayCategory(row.category),
    })
  } catch (e) {
    console.error('issue-recipients POST:', e)
    if (e?.code === '23505') {
      return NextResponse.json(
        { error: 'A person with this email already exists. Refresh and select or update the existing person.' },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
