import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '../../../lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    await ensureDatabase()
    const pgUrl = getPgUrl()
    if (!pgUrl) {
      return NextResponse.json(
        { error: 'Database not configured. Please set up Postgres.' },
        { status: 503 }
      )
    }
    await ensureCostCodesTable()
    const result = await sql`
      SELECT id, code, description, category, active
      FROM cost_codes
      WHERE active = true
      ORDER BY code ASC
    `
    return NextResponse.json(result.rows)
  } catch (error) {
    console.error('Error fetching cost codes:', error)
    return NextResponse.json(
      { error: 'Failed to fetch cost codes', details: error.message },
      { status: 500 }
    )
  }
}
