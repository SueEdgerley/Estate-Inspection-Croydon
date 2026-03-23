import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { sql } from '@vercel/postgres'
import { getPgUrl } from '@/lib/db'
import { isAdmin } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ROLES = ['caretaker', 'esm', 'housing officer', 'admin']

async function requireAdmin() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const admin = await isAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!getPgUrl()) return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  return null
}

export async function GET() {
  const err = await requireAdmin()
  if (err) return err
  try {
    const result = await sql`
      SELECT id, airtable_id, name, email, role, category, active, created_at
      FROM people
      ORDER BY name
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
    const body = await request.json().catch(() => ({}))
    const name = body.name && String(body.name).trim()
    const email = body.email && String(body.email).trim()
    if (!name || !email) return NextResponse.json({ error: 'name and email are required' }, { status: 400 })
    const role = body.role && ROLES.includes(String(body.role).toLowerCase()) ? String(body.role).toLowerCase() : null
    const id = body.id && String(body.id).trim() ? String(body.id).trim() : `person_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`
    await sql`
      INSERT INTO people (id, name, email, role, active)
      VALUES (${id}, ${name}, ${email}, ${role}, true)
      ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, role = COALESCE(EXCLUDED.role, people.role), active = true, updated_at = CURRENT_TIMESTAMP
    `
    const row = (await sql`SELECT id, name, email, role, active FROM people WHERE email = ${email}`).rows[0]
    return NextResponse.json(row)
  } catch (e) {
    console.error('Admin users POST:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
