import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request, { params }) {
  try {
    await ensureDatabase()
    const pgUrl = getPgUrl()
    if (!pgUrl) {
      return NextResponse.json(
        { error: 'Database not configured. Please set up Postgres.' },
        { status: 503 }
      )
    }
    const { id } = await params

    // Use * so a missing optional column (e.g. before migrate) cannot 500 the whole GET.
    const result = await sql`
      SELECT *
      FROM inspections
      WHERE id = ${id}
    `

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Inspection not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(result.rows[0])
  } catch (error) {
    console.error('Error fetching inspection:', error)
    return NextResponse.json(
      { error: 'Failed to fetch inspection', details: error.message },
      { status: 500 }
    )
  }
}
