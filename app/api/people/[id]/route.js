import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET - Get person by ID
export async function GET(request, { params }) {
  try {
    await ensureDatabase()
    
    if (!process.env.POSTGRES_URL) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 503 }
      )
    }

    const { id } = await params

    const result = await sql`
      SELECT id, airtable_id, name, email, role, category, active
      FROM people
      WHERE id = ${id} AND active = true
    `

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Person not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(result.rows[0])
  } catch (error) {
    console.error('Error fetching person:', error)
    return NextResponse.json(
      { error: 'Failed to fetch person', details: error.message },
      { status: 500 }
    )
  }
}
