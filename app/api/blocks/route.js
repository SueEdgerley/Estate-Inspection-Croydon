import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Reference blocks from Postgres (same source as inspection forms). Not Airtable. */
export async function GET() {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!getPgUrl()) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  }
  try {
    await ensureDatabase()
    const result = await sql`
      SELECT id, estate_id, name, active
      FROM blocks
      WHERE COALESCE(active, true) = true
      ORDER BY name
    `
    return NextResponse.json(
      { blocks: result.rows },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    )
  } catch (error) {
    console.error('Error fetching blocks from Postgres:', error)
    return NextResponse.json(
      { error: 'Failed to fetch blocks', details: error.message },
      { status: 500 }
    )
  }
}
