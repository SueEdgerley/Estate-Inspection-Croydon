import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '@/lib/db'
import { ensureRepairActionFields } from '@/lib/repair-action-fields'

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
    await ensureRepairActionFields(sql)
    const result = await sql`
      SELECT 
        a.id, a.inspection_id, a.section_id, a.section_name, a.question_id,
        a.category, a.priority, a.title, a.description, a.location, a.status,
        a.comment, a.recipient_person_id, a.auto_created, a.photo_urls, a.issue_pdf_url,
        a.job_number, a.expected_completion_date, a.repair_notes, a.repair_photo_url, a.repair_updated_at,
        a.created_at, a.updated_at,
        COALESCE(i.inspector_name, i.inspector_id, 'Inspector') AS created_by,
        p.name AS assigned_to,
        p.email AS assigned_to_email,
        i.title AS inspection_title,
        i.template_name AS inspection_template_name,
        i.type AS inspection_type,
        i.due_date AS inspection_due_date,
        COALESCE(NULLIF(CONCAT_WS(' / ', e.name, b.name), ''), i.location_label, i.title) AS estate_block_name
      FROM actions a
      LEFT JOIN inspections i ON i.id = a.inspection_id
      LEFT JOIN estates e ON e.id = i.estate_id
      LEFT JOIN blocks b ON b.id = COALESCE(a.block_id, i.block_id)
      LEFT JOIN people p ON p.id = a.recipient_person_id
      WHERE a.id = ${id}
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
    const repairFieldsAvailable = await ensureRepairActionFields(sql)

    const buildUpdates = ({ includeRepairFields = true, includeJobDate = true } = {}) => {
      const updates = []

      if (data.category !== undefined) updates.push(sql`category = ${data.category}`)
      if (data.priority !== undefined) updates.push(sql`priority = ${data.priority}`)
      if (data.title !== undefined) updates.push(sql`title = ${data.title}`)
      if (data.description !== undefined) updates.push(sql`description = ${data.description}`)
      if (data.location !== undefined) updates.push(sql`location = ${data.location}`)
      if (data.status !== undefined) updates.push(sql`status = ${data.status}`)
      if (data.comment !== undefined) updates.push(sql`comment = ${data.comment}`)
      if (data.recipient_person_id !== undefined) updates.push(sql`recipient_person_id = ${data.recipient_person_id}`)
      if (includeJobDate && data.job_number !== undefined) updates.push(sql`job_number = ${data.job_number || null}`)
      if (includeJobDate && data.expected_completion_date !== undefined) {
        updates.push(sql`expected_completion_date = ${data.expected_completion_date || null}`)
      }

      if (includeRepairFields && data.repair_notes !== undefined) {
        updates.push(sql`repair_notes = ${data.repair_notes || null}`)
      } else if (!includeRepairFields && data.repair_notes !== undefined && data.comment === undefined) {
        updates.push(sql`comment = ${data.repair_notes || null}`)
      }

      if (includeRepairFields && data.repair_photo_url !== undefined) {
        updates.push(sql`repair_photo_url = ${data.repair_photo_url || null}`)
      }
      if (
        includeRepairFields &&
        (data.job_number !== undefined ||
          data.expected_completion_date !== undefined ||
          data.repair_notes !== undefined ||
          data.repair_photo_url !== undefined)
      ) {
        updates.push(sql`repair_updated_at = CURRENT_TIMESTAMP`)
      }

      updates.push(sql`updated_at = CURRENT_TIMESTAMP`)
      return updates
    }

    const updates = buildUpdates({ includeRepairFields: repairFieldsAvailable, includeJobDate: true })

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    let result
    try {
      result = await sql`
        UPDATE actions
        SET ${sql.join(updates, sql`, `)}
        WHERE id = ${id}
        RETURNING *
      `
    } catch (fullUpdateError) {
      console.warn('[actions/:id] full update failed; retrying without optional repair fields:', fullUpdateError?.message || fullUpdateError)
      const fallbackUpdates = buildUpdates({ includeRepairFields: false, includeJobDate: true })
      try {
        result = await sql`
          UPDATE actions
          SET ${sql.join(fallbackUpdates, sql`, `)}
          WHERE id = ${id}
          RETURNING *
        `
      } catch (fallbackUpdateError) {
        console.warn('[actions/:id] fallback update failed; retrying status/notes core update only:', fallbackUpdateError?.message || fallbackUpdateError)
        const minimumUpdates = buildUpdates({ includeRepairFields: false, includeJobDate: false })
        result = await sql`
          UPDATE actions
          SET ${sql.join(minimumUpdates, sql`, `)}
          WHERE id = ${id}
          RETURNING *
        `
      }
    }

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
