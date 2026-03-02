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
    const result = await sql`SELECT id, name, created_at FROM estates ORDER BY name`
    return NextResponse.json(result.rows)
  } catch (e) {
    console.error('Admin estates GET:', e)
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
    const id = body.id && String(body.id).trim() ? String(body.id).trim() : `estate_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`
    await sql`
      INSERT INTO estates (id, name) VALUES (${id}, ${name})
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, updated_at = CURRENT_TIMESTAMP
    `
    return NextResponse.json({ id, name })
  } catch (e) {
    console.error('Admin estates POST:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
