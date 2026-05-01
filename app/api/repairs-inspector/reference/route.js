import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function normalizeArea(value) {
  const area = String(value || '').trim()
  const allowed = ['North', 'South', 'Central', 'West']
  return allowed.find((option) => option.toLowerCase() === area.toLowerCase()) || ''
}

export async function GET() {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (!getPgUrl()) return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
    await ensureDatabase()

    const blocks = await sql`
      SELECT
        b.id AS block_id,
        b.name AS block_name,
        b.postcode,
        e.id AS estate_id,
        e.name AS estate_name,
        e.area AS estate_area
      FROM blocks b
      LEFT JOIN estates e ON e.id = b.estate_id
      WHERE COALESCE(b.active, true) = true
      ORDER BY COALESCE(e.name, ''), b.name
    `

    const estates = await sql`
      SELECT e.id AS estate_id, e.name AS estate_name, e.area AS estate_area
      FROM estates e
      WHERE NOT EXISTS (
        SELECT 1 FROM blocks b
        WHERE b.estate_id = e.id
          AND COALESCE(b.active, true) = true
      )
      ORDER BY e.name
    `

    const locations = [
      ...(blocks.rows || []).map((row) => ({
        id: row.block_id,
        type: 'block',
        estate_id: row.estate_id || '',
        block_id: row.block_id,
        estate_name: row.estate_name || '',
        block_name: row.block_name || '',
        label: [row.estate_name, row.block_name].filter(Boolean).join(' / ') || row.block_name || 'Unnamed block',
        area: normalizeArea(row.estate_area),
        postcode: row.postcode || '',
      })),
      ...(estates.rows || []).map((row) => ({
        id: row.estate_id,
        type: 'estate',
        estate_id: row.estate_id,
        block_id: '',
        estate_name: row.estate_name || '',
        block_name: '',
        label: row.estate_name || 'Unnamed estate',
        area: normalizeArea(row.estate_area),
        postcode: '',
      })),
    ]

    return NextResponse.json(
      { locations },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    )
  } catch (error) {
    console.error('[repairs-inspector/reference] GET:', error)
    return NextResponse.json(
      { error: 'Failed to load repair location data', details: error?.message || String(error) },
      { status: 500 }
    )
  }
}
