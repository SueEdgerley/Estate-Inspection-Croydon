import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET - Get action by ID
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
    const result = await sql`
      SELECT 
        id, inspection_id, section_id, section_name, question_id,
        category, priority, title, description, location, status,
        comment, recipient_person_id, auto_created, photo_urls, issue_pdf_url,
        job_number, expected_completion_date, repair_notes, repair_photo_url, repair_updated_at,
        created_at, updated_at
      FROM actions
      WHERE id = ${id}
    `

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Action not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(result.rows[0])
  } catch (error) {
    console.error('Error fetching action:', error)
    return NextResponse.json(
      { error: 'Failed to fetch action', details: error.message },
      { status: 500 }
    )
  }
}

// PUT - Update action
export async function PUT(request, { params }) {
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
    const data = await request.json()

    // Build update query dynamically
    const updates = []
    const values = []
    
    if (data.category !== undefined) {
      updates.push(sql`category = ${data.category}`)
    }
    if (data.priority !== undefined) {
      updates.push(sql`priority = ${data.priority}`)
    }
    if (data.title !== undefined) {
      updates.push(sql`title = ${data.title}`)
    }
    if (data.description !== undefined) {
      updates.push(sql`description = ${data.description}`)
    }
    if (data.location !== undefined) {
      updates.push(sql`location = ${data.location}`)
    }
    if (data.status !== undefined) {
      updates.push(sql`status = ${data.status}`)
    }
    if (data.comment !== undefined) {
      updates.push(sql`comment = ${data.comment}`)
    }
    if (data.recipient_person_id !== undefined) {
      updates.push(sql`recipient_person_id = ${data.recipient_person_id}`)
    }
    if (data.job_number !== undefined) {
      updates.push(sql`job_number = ${data.job_number || null}`)
    }
    if (data.expected_completion_date !== undefined) {
      updates.push(sql`expected_completion_date = ${data.expected_completion_date || null}`)
    }
    if (data.repair_notes !== undefined) {
      updates.push(sql`repair_notes = ${data.repair_notes || null}`)
    }
    if (data.repair_photo_url !== undefined) {
      updates.push(sql`repair_photo_url = ${data.repair_photo_url || null}`)
    }
    if (
      data.job_number !== undefined ||
      data.expected_completion_date !== undefined ||
      data.repair_notes !== undefined ||
      data.repair_photo_url !== undefined
    ) {
      updates.push(sql`repair_updated_at = CURRENT_TIMESTAMP`)
    }
    
    updates.push(sql`updated_at = CURRENT_TIMESTAMP`)

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    const result = await sql`
      UPDATE actions
      SET ${sql.join(updates, sql`, `)}
      WHERE id = ${id}
      RETURNING *
    `

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Action not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(result.rows[0])
  } catch (error) {
    console.error('Error updating action:', error)
    return NextResponse.json(
      { error: 'Failed to update action', details: error.message },
      { status: 500 }
    )
  }
}
