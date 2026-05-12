import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '@/lib/db'
import { ensureRepairActionFields } from '@/lib/repair-action-fields'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const STATUS_VALUES = ['open', 'in_progress', 'completed', 'closed']

function normalizeStatus(value) {
  const status = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (!status) return 'open'
  if (!STATUS_VALUES.includes(status)) {
    throw new Error(`Invalid repair status "${value}"`)
  }
  return status
}

function normalizeDateOnly(value) {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  const date = String(value).trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('Expected completion date must be in YYYY-MM-DD format')
  }
  return date
}

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
        COALESCE(
          CASE WHEN lower(trim(COALESCE(i.inspector_name, ''))) <> 'inspector' THEN NULLIF(trim(i.inspector_name), '') END,
          NULLIF(trim(completed_person.name), ''),
          NULLIF(trim(completed_user.email), ''),
          CASE WHEN i.inspector_id LIKE '%@%' THEN NULLIF(trim(i.inspector_id), '') END
        ) AS created_by,
        p.name AS assigned_to,
        p.email AS assigned_to_email,
        i.title AS inspection_title,
        i.template_name AS inspection_template_name,
        i.type AS inspection_type,
        i.due_date AS inspection_due_date,
        COALESCE(NULLIF(CONCAT_WS(' / ', e.name, b.name), ''), i.location_label, i.title) AS estate_block_name
      FROM actions a
      LEFT JOIN inspections i ON i.id = a.inspection_id
      LEFT JOIN users completed_user ON completed_user.clerk_user_id = i.inspector_id OR lower(trim(completed_user.email)) = lower(trim(i.inspector_id))
      LEFT JOIN people completed_person ON completed_person.id = completed_user.people_id OR lower(trim(completed_person.email)) = lower(trim(COALESCE(completed_user.email, i.inspector_id, '')))
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
  let id = null
  let debugPayload = null
  try {
    await ensureDatabase()
    const pgUrl = getPgUrl()
    if (!pgUrl) {
      return NextResponse.json(
        { error: 'Database not configured. Please set up Postgres.' },
        { status: 503 }
      )
    }
    const routeParams = await params
    id = routeParams.id
    const data = await request.json()
    const repairFieldsAvailable = await ensureRepairActionFields(sql)
    if (!repairFieldsAvailable) {
      throw new Error('Repair action columns could not be verified or created on actions table')
    }

    const normalizedData = {
      ...data,
      ...(data.status !== undefined ? { status: normalizeStatus(data.status) } : {}),
      ...(data.expected_completion_date !== undefined
        ? { expected_completion_date: normalizeDateOnly(data.expected_completion_date) }
        : {}),
    }
    debugPayload = {
      action_id: id,
      fields: Object.keys(data || {}),
      job_number_present: data.job_number !== undefined && data.job_number !== null && data.job_number !== '',
      expected_completion_date: normalizedData.expected_completion_date ?? null,
      status: normalizedData.status ?? null,
      repair_notes_present: data.repair_notes !== undefined && data.repair_notes !== null && data.repair_notes !== '',
      repair_photo_url_present: data.repair_photo_url !== undefined && data.repair_photo_url !== null && data.repair_photo_url !== '',
    }

    const buildUpdateQuery = () => {
      const clauses = []
      const values = []
      const add = (column, value) => {
        values.push(value)
        clauses.push(`${column} = $${values.length}`)
      }

      if (normalizedData.category !== undefined) add('category', normalizedData.category)
      if (normalizedData.priority !== undefined) add('priority', normalizedData.priority)
      if (normalizedData.title !== undefined) add('title', normalizedData.title)
      if (normalizedData.description !== undefined) add('description', normalizedData.description)
      if (normalizedData.location !== undefined) add('location', normalizedData.location)
      if (normalizedData.status !== undefined) add('status', normalizedData.status)
      if (normalizedData.comment !== undefined) add('comment', normalizedData.comment)
      if (normalizedData.recipient_person_id !== undefined) add('recipient_person_id', normalizedData.recipient_person_id)
      if (normalizedData.job_number !== undefined) add('job_number', normalizedData.job_number || null)
      if (normalizedData.expected_completion_date !== undefined) {
        add('expected_completion_date', normalizedData.expected_completion_date)
      }
      if (normalizedData.repair_notes !== undefined) add('repair_notes', normalizedData.repair_notes || null)
      if (normalizedData.repair_photo_url !== undefined) add('repair_photo_url', normalizedData.repair_photo_url || null)
      if (
        normalizedData.job_number !== undefined ||
        normalizedData.expected_completion_date !== undefined ||
        normalizedData.repair_notes !== undefined ||
        normalizedData.repair_photo_url !== undefined
      ) {
        clauses.push('repair_updated_at = CURRENT_TIMESTAMP')
      }

      clauses.push('updated_at = CURRENT_TIMESTAMP')
      values.push(id)
      return {
        text: `UPDATE actions SET ${clauses.join(', ')} WHERE id = $${values.length} RETURNING *`,
        values,
        count: clauses.length,
      }
    }

    const updateQuery = buildUpdateQuery()

    if (updateQuery.count === 1) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    const result = await sql.query(updateQuery.text, updateQuery.values)

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Action not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(result.rows[0])
  } catch (error) {
    const message = error?.message || String(error)
    console.error('Error updating action:', { error: message, action_id: id, payload: debugPayload })
    return NextResponse.json(
      { error: message, details: message },
      { status: 500 }
    )
  }
}
