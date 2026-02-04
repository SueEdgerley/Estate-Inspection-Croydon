import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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
      SELECT 
        id, type, location_label, inspector_name, inspector_id,
        template_id, template_name, due_date, submitted_at, grading, pdf_url,
        status, is_scheduled, title, description, created_at, updated_at
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
