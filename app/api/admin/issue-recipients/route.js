import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '@/lib/db'
import { getAppAdminAccess } from '@/lib/app-admin-access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CATEGORY = 'issue_recipient'

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
      SELECT id, name, email, active, created_at
      FROM people
      WHERE category = ${CATEGORY}
      ORDER BY name ASC, email ASC
    `
    return NextResponse.json(result.rows)
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
    const email = body.email && String(body.email).trim()
    if (!name || !email) return NextResponse.json({ error: 'name and email are required' }, { status: 400 })
    const existing = await sql`
      SELECT id, category FROM people WHERE lower(trim(email)) = lower(trim(${email})) LIMIT 1
    `
    if (existing.rows[0] && existing.rows[0].category !== CATEGORY) {
      return NextResponse.json(
        { error: 'This email is already used for a team user. Use a different email for routing.' },
        { status: 409 }
      )
    }
    const id =
      body.id && String(body.id).trim()
        ? String(body.id).trim()
        : `recipient_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`
    await sql`
      INSERT INTO people (id, name, email, role, category, active)
      VALUES (${id}, ${name}, ${email}, null, ${CATEGORY}, true)
      ON CONFLICT (email) DO UPDATE SET
        name = EXCLUDED.name,
        category = EXCLUDED.category,
        role = null,
        active = true,
        updated_at = CURRENT_TIMESTAMP
    `
    const row = (
      await sql`SELECT id, name, email, active FROM people WHERE lower(trim(email)) = lower(trim(${email})) LIMIT 1`
    ).rows[0]
    return NextResponse.json(row)
  } catch (e) {
    console.error('issue-recipients POST:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
