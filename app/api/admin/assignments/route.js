import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { getPgUrl } from '@/lib/db'
import { getRouteAccess } from '@/lib/permissions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ROLES = ['caretaker', 'esm', 'housing officer', 'admin']

async function requireAdmin() {
  const { denialResponse } = await getRouteAccess({ requireAdmin: true })
  if (denialResponse) return denialResponse
  if (!getPgUrl()) return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  return null
}

export async function GET() {
  const err = await requireAdmin()
  if (err) return err
  try {
    const result = await sql`
      SELECT ua.id, ua.person_id, ua.estate_id, ua.block_id, ua.role, ua.starts_at, ua.ends_at, ua.created_at,
             p.name as person_name, p.email as person_email,
             e.name as estate_name, b.name as block_name
      FROM user_assignments ua
      JOIN people p ON p.id = ua.person_id
      LEFT JOIN estates e ON e.id = ua.estate_id
      LEFT JOIN blocks b ON b.id = ua.block_id
      ORDER BY ua.starts_at DESC
    `
    return NextResponse.json(result.rows)
  } catch (e) {
    console.error('Admin assignments GET:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request) {
  const err = await requireAdmin()
  if (err) return err
  try {
    const body = await request.json().catch(() => ({}))
    const personId = body.person_id && String(body.person_id).trim()
    const role = body.role && ROLES.includes(String(body.role).toLowerCase()) ? String(body.role).toLowerCase() : null
    if (!personId || !role) return NextResponse.json({ error: 'person_id and role are required' }, { status: 400 })
    const estateId = body.estate_id && String(body.estate_id).trim() ? String(body.estate_id).trim() : null
    const blockId = body.block_id && String(body.block_id).trim() ? String(body.block_id).trim() : null
    if (!estateId && !blockId) return NextResponse.json({ error: 'estate_id or block_id required' }, { status: 400 })
    const startsAt = body.starts_at ? new Date(body.starts_at).toISOString() : new Date().toISOString()
    const endsAt = body.ends_at ? new Date(body.ends_at).toISOString() : null
    const id = body.id && String(body.id).trim() ? String(body.id).trim() : `ua_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`
    await sql`
      INSERT INTO user_assignments (id, person_id, estate_id, block_id, role, starts_at, ends_at)
      VALUES (${id}, ${personId}, ${estateId}, ${blockId}, ${role}, ${startsAt}, ${endsAt})
    `
    const row = (await sql`
      SELECT ua.id, ua.person_id, ua.estate_id, ua.block_id, ua.role, ua.starts_at, ua.ends_at,
             p.name as person_name, p.email as person_email
      FROM user_assignments ua
      JOIN people p ON p.id = ua.person_id
      WHERE ua.id = ${id}
    `).rows[0]
    return NextResponse.json(row)
  } catch (e) {
    console.error('Admin assignments POST:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
