import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '@/lib/db'
import { getRouteAccess } from '@/lib/permissions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ALLOWED_MODES = new Set(['ad_hoc', 'scheduled'])
const ALLOWED_STATUSES = new Set(['draft', 'scheduled', 'submitted'])

function asText(value) {
  if (value == null) return ''
  return String(value).trim()
}

function toNullable(value) {
  const text = asText(value)
  return text || null
}

function parseDateInput(value) {
  const text = asText(value)
  if (!text) return null
  const parsed = new Date(`${text}T00:00:00.000Z`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function buildDescription({ mode, reason, notes, frequency, startDate, endDate }) {
  const lines = []
  if (mode === 'ad_hoc' && reason) lines.push(`Reason: ${reason}`)
  if (mode === 'scheduled' && frequency) lines.push(`Frequency: ${frequency}`)
  if (mode === 'scheduled' && startDate) lines.push(`Start: ${startDate}`)
  if (mode === 'scheduled' && endDate) lines.push(`End: ${endDate}`)
  if (notes) lines.push(`Notes: ${notes}`)
  return lines.join('\n')
}

export async function POST(request) {
  const { access, denialResponse } = await getRouteAccess({ requireInspections: true })
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

    const mode = asText(body.mode).toLowerCase() || 'ad_hoc'
    if (!ALLOWED_MODES.has(mode)) {
      return NextResponse.json({ error: 'mode must be ad_hoc or scheduled' }, { status: 400 })
    }
    if (mode === 'ad_hoc' && !access?.permissions?.canCreateAdHocInspection) {
      return NextResponse.json(
        {
          error: 'You do not have permission to create ad hoc inspections',
          code: 'AD_HOC_CREATE_NOT_ALLOWED',
        },
        { status: 403 }
      )
    }
    if (mode === 'scheduled' && !access?.permissions?.canCreateScheduledInspection) {
      return NextResponse.json(
        {
          error: 'You do not have permission to create scheduled inspections',
          code: 'SCHEDULE_CREATE_NOT_ALLOWED',
        },
        { status: 403 }
      )
    }

    const status = asText(body.status).toLowerCase() || (mode === 'scheduled' ? 'scheduled' : 'draft')
    if (!ALLOWED_STATUSES.has(status)) {
      return NextResponse.json({ error: 'status must be one of: draft, scheduled, submitted' }, { status: 400 })
    }

    const area = asText(body.area)
    if (!area) return NextResponse.json({ error: 'area is required' }, { status: 400 })

    const estateId = toNullable(body.estate_id)
    const blockId = toNullable(body.block_id)
    const assignedPersonId = asText(body.assigned_person_id)
    const assignedPersonNameInput = asText(body.assigned_person_name)
    const assignedPersonEmailInput = asText(body.assigned_person_email)
    if (!assignedPersonId && !assignedPersonNameInput) {
      return NextResponse.json({ error: 'assigned_person_name is required' }, { status: 400 })
    }

    let assignedPerson = null
    if (assignedPersonId) {
      const personResult = await sql`
        SELECT id, name, email
        FROM people
        WHERE id = ${assignedPersonId} AND COALESCE(active, true) = true
        LIMIT 1
      `
      assignedPerson = personResult.rows[0] || null
      if (!assignedPerson) {
        return NextResponse.json({ error: 'Assigned person not found or inactive' }, { status: 400 })
      }
    }

    const inspectorName = assignedPerson?.name || assignedPersonNameInput
    const inspectorId =
      assignedPerson?.email ||
      assignedPerson?.id ||
      assignedPersonEmailInput ||
      access.email ||
      inspectorName

    const reason = asText(body.reason)
    const notes = asText(body.notes)
    const dueDate = parseDateInput(body.due_date || body.inspection_date)
    if (!dueDate) {
      return NextResponse.json({ error: 'A valid due/inspection date is required (YYYY-MM-DD)' }, { status: 400 })
    }

    let type = 'ad_hoc_inspection'
    let title = `Ad hoc: ${reason || 'Inspection'}`
    let templateId = null
    let templateName = null
    let isScheduled = false
    let scheduleFrequency = null
    let scheduleStartDate = null
    let scheduleEndDate = null

    if (mode === 'ad_hoc') {
      const inspectionType = asText(body.inspection_type) || 'ad_hoc_inspection'
      if (!reason) {
        return NextResponse.json({ error: 'reason is required for ad hoc inspections' }, { status: 400 })
      }
      type = inspectionType
      title = `Ad hoc: ${reason}`.slice(0, 500)
    } else {
      const templateIdInput = asText(body.template_id)
      const templateNameInput = asText(body.template_name)
      const frequency = asText(body.frequency)
      const startDateInput = asText(body.start_date)
      const endDateInput = asText(body.end_date)

      if (!templateIdInput || !templateNameInput) {
        return NextResponse.json({ error: 'template_id and template_name are required for scheduled inspections' }, { status: 400 })
      }
      if (!frequency) {
        return NextResponse.json({ error: 'frequency is required for scheduled inspections' }, { status: 400 })
      }
      if (!startDateInput) {
        return NextResponse.json({ error: 'start_date is required for scheduled inspections' }, { status: 400 })
      }

      type = 'scheduled_inspection'
      title = `Scheduled: ${templateNameInput}`.slice(0, 500)
      templateId = templateIdInput
      templateName = templateNameInput
      isScheduled = true
      scheduleFrequency = frequency
      scheduleStartDate = startDateInput
      scheduleEndDate = endDateInput || null
    }

    const inspectionId = crypto.randomUUID()
    const submittedAt = status === 'submitted' ? new Date() : null
    const description = buildDescription({
      mode,
      reason,
      notes,
      frequency: scheduleFrequency,
      startDate: scheduleStartDate,
      endDate: scheduleEndDate,
    })

    const metadata = {
      workflow: mode === 'scheduled' ? 'scheduled_manual' : 'ad_hoc_manual',
      created_from: 'manage_inspections',
      schedule:
        mode === 'scheduled'
          ? {
              frequency: scheduleFrequency,
              start_date: scheduleStartDate,
              end_date: scheduleEndDate,
            }
          : null,
      ad_hoc:
        mode === 'ad_hoc'
          ? {
              inspection_type: type,
              reason,
            }
          : null,
      assigned_person: {
        id: assignedPerson?.id || null,
        name: inspectorName || null,
        email: assignedPerson?.email || assignedPersonEmailInput || null,
      },
    }

    const insertResult = await sql`
      INSERT INTO inspections (
        id, legacy_inspection_id, type, title, description, location_label,
        template_id, template_name, template_version, due_date, submitted_at, grading,
        status, is_scheduled, inspector_id, inspector_name, estate_id, block_id, created_at, updated_at
      )
      VALUES (
        ${inspectionId},
        NULL,
        ${type},
        ${title},
        ${description || null},
        ${area},
        ${templateId},
        ${templateName},
        ${JSON.stringify(metadata)}::jsonb,
        ${dueDate},
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
      RETURNING id, type, title, location_label, template_name, due_date, status, is_scheduled, inspector_name, inspector_id, estate_id, block_id, created_at
    `

    return NextResponse.json(
      {
        inspectionId: insertResult.rows[0]?.id ?? inspectionId,
        inspection: insertResult.rows[0] ?? null,
        workflow: metadata.workflow,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('[Manage inspections] create failed:', error)
    return NextResponse.json(
      { error: 'Failed to create inspection', details: error?.message || String(error) },
      { status: 500 }
    )
  }
}
