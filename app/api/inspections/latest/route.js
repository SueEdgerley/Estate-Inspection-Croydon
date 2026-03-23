import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { getPgUrl } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET /api/inspections/latest – last 10 inspections (id, estate, block, createdAt) to confirm submits are landing. */
export async function GET() {
  if (!getPgUrl()) {
    return NextResponse.json(
      { error: 'Database not configured' },
      { status: 503 }
    )
  }
  try {
    const result = await sql`
      SELECT i.id, i.created_at AS "createdAt",
             e.name AS estate,
             b.name AS block
      FROM inspections i
      LEFT JOIN estates e ON e.id = i.estate_id
      LEFT JOIN blocks b ON b.id = i.block_id
      ORDER BY i.created_at DESC NULLS LAST
      LIMIT 10
    `
    return NextResponse.json(result.rows)
  } catch (e) {
    console.error('Inspections latest GET:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
