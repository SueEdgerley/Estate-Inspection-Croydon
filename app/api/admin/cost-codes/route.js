import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { sql } from '@vercel/postgres'
import { getPgUrl } from '../../../../lib/db'
import { isAdmin } from '../../../../lib/auth'

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

async function ensureCostCodesTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS cost_codes (
      id VARCHAR(255) PRIMARY KEY,
      code VARCHAR(100) NOT NULL UNIQUE,
      description TEXT,
      category VARCHAR(100),
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `
}

export async function GET() {
  const err = await requireAdmin()
  if (err) return err
  try {
    await ensureCostCodesTable()
    const result = await sql`
      SELECT id, code, description, category, active, created_at
      FROM cost_codes
      ORDER BY code
    `
    return NextResponse.json(result.rows)
  } catch (e) {
    console.error('Admin cost-codes GET:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request) {
  const err = await requireAdmin()
  if (err) return err
  try {
    await ensureCostCodesTable()
    const body = await request.json().catch(() => ({}))
    const code = body.code && String(body.code).trim()
    if (!code) return NextResponse.json({ error: 'code is required' }, { status: 400 })
    const description = body.description ? String(body.description).trim() : null
    const category = body.category ? String(body.category).trim() : null
    const id = body.id && String(body.id).trim()
      ? String(body.id).trim()
      : `cc_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`
    await sql`
      INSERT INTO cost_codes (id, code, description, category, active)
      VALUES (${id}, ${code}, ${description}, ${category}, true)
      ON CONFLICT (code) DO UPDATE
      SET description = EXCLUDED.description,
          category = EXCLUDED.category,
          active = true,
          updated_at = CURRENT_TIMESTAMP
    `
    const row = (await sql`SELECT id, code, description, category, active FROM cost_codes WHERE code = ${code}`).rows[0]
    return NextResponse.json(row)
  } catch (e) {
    console.error('Admin cost-codes POST:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
