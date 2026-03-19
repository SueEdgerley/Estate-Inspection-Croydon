import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '@/lib/db'
import { getRouteAccess } from '@/lib/permissions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ALLOWED_STATUSES = new Set(['draft', 'scheduled', 'submitted'])

function asText(value) {
  if (value == null) return ''
  return String(value).trim()
}

function toNullable(value) {
  const text = asText(value)
  return text || null
}

function parseDateOnly(dateStr) {
  const text = asText(dateStr)
  if (!text) return null
  const parsed = new Date(`${text}T00:00:00.000Z`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export async function POST(request) {
  const { access, denialResponse } = await getRouteAccess({
    requireInspections: true,
    requireAdHocCreate: true,
  })
  if (denialResponse) return denialResponse

  try {
    await ensureDatabase()
    if (!getPgUrl()) {
      return NextResponse.json(
        { error: 'Database not configured. Please set up Postgres.' },
        { status: 503 }
      )
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const inspectionDateText = asText(body.inspection_date)
    const area = asText(body.area)
    const estateId = toNullable(body.estate_id)
    const blockId = toNullable(body.block_id)
    const assignedPersonId = asText(body.assigned_person_id)
    const assignedPersonNameInput = asText(body.assigned_person_name)
    const assignedPersonEmailInput = asText(body.assigned_person_email)
    const inspectionType = asText(body.inspection_type) || 'ad_hoc_inspection'
    const reason = asText(body.reason)
    const notes = asText(body.notes)
    const status = asText(body.status).toLowerCase() || 'draft'

    if (!inspectionDateText) {
      return NextResponse.json({ error: 'inspection_date is required' }, { status: 400 })
    }
    if (!area) {
      return NextResponse.json({ error: 'area is required' }, { status: 400 })
    }
    if (!assignedPersonId && !assignedPersonNameInput) {
      return NextResponse.json({ error: 'assigned_person_name is required' }, { status: 400 })
    }
    if (!reason) {
      return NextResponse.json({ error: 'reason is required' }, { status: 400 })
    }
    if (!ALLOWED_STATUSES.has(status)) {
      return NextResponse.json({ error: 'status must be one of: draft, scheduled, submitted' }, { status: 400 })
    }

    const inspectionDate = parseDateOnly(inspectionDateText)
    if (!inspectionDate) {
      return NextResponse.json({ error: 'inspection_date must be a valid date (YYYY-MM-DD)' }, { status: 400 })
    }

    let assignedPerson = null
    if (assignedPersonId) {
      const assignedPersonResult = await sql`
        SELECT id, name, email
        FROM people
        WHERE id = ${assignedPersonId} AND COALESCE(active, true) = true
        LIMIT 1
      `
      assignedPerson = assignedPersonResult.rows[0] || null
      if (!assignedPerson) {
        return NextResponse.json({ error: 'Assigned person not found or inactive' }, { status: 400 })
      }
    }

    const inspectionId = crypto.randomUUID()
    const title = `Ad hoc: ${reason}`.slice(0, 500)
    const description = [`Reason: ${reason}`, notes ? `Notes: ${notes}` : null].filter(Boolean).join('\n\n')
    const isScheduled = status === 'scheduled'
    const submittedAt = status === 'submitted' ? new Date() : null

    const inspectorName = assignedPerson?.name || assignedPersonNameInput
    const inspectorId =
      assignedPerson?.email ||
      assignedPerson?.id ||
      assignedPersonEmailInput ||
      access.email ||
      inspectorName

    const insertResult = await sql`
      INSERT INTO inspections (
        id, legacy_inspection_id, type, title, description, location_label,
        template_id, template_name, template_version, due_date, submitted_at, grading,
        status, is_scheduled, inspector_id, inspector_name, estate_id, block_id, created_at, updated_at
      )
      VALUES (
        ${inspectionId},
        NULL,
        ${inspectionType},
        ${title},
        ${description || null},
        ${area},
        NULL,
        NULL,
        NULL,
        ${inspectionDate},
        ${submittedAt},
        NULL,
        ${status},
        ${isScheduled},
        ${inspectorId || null},
        ${inspectorName || null},
        ${estateId},
        ${blockId},
        ${new Date()},
        ${new Date()}
      )
      RETURNING id, type, title, description, location_label, due_date, status, inspector_name, inspector_id, estate_id, block_id
    `

    return NextResponse.json(
      {
        inspectionId: insertResult.rows[0]?.id ?? inspectionId,
        inspection: insertResult.rows[0] ?? null,
        workflow: 'ad_hoc_manual',
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('[Ad hoc inspections] create failed:', error)
    return NextResponse.json(
      { error: 'Failed to create ad hoc inspection', details: error?.message || String(error) },
      { status: 500 }
    )
  }
}
