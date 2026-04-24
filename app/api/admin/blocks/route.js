import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { sql } from '@vercel/postgres'
import { getPgUrl } from '@/lib/db'
import { isAdmin } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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
      SELECT b.id, b.estate_id, b.name, b.active, b.created_at, e.name as estate_name
      FROM blocks b
      LEFT JOIN estates e ON e.id = b.estate_id
      ORDER BY b.active DESC, b.name
    `
    return NextResponse.json(result.rows)
  } catch (e) {
    console.error('Admin blocks GET:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request) {
  const err = await requireAdmin()
  if (err) return err
  try {
    const body = await request.json().catch(() => ({}))
    const name = body.name && String(body.name).trim()
    if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })
    const estateId = body.estate_id && String(body.estate_id).trim() ? String(body.estate_id).trim() : null
    const active = body.active === false ? false : true
    const id = body.id && String(body.id).trim() ? String(body.id).trim() : `block_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`
    await sql`
      INSERT INTO blocks (id, estate_id, name, active) VALUES (${id}, ${estateId}, ${name}, ${active})
      ON CONFLICT (id) DO UPDATE SET
        estate_id = EXCLUDED.estate_id,
        name = EXCLUDED.name,
        active = EXCLUDED.active,
        updated_at = CURRENT_TIMESTAMP
    `
    return NextResponse.json({ id, estate_id: estateId, name, active })
  } catch (e) {
    console.error('Admin blocks POST:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
