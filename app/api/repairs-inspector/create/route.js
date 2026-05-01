import { NextResponse } from 'next/server'
import { auth, currentUser } from '@clerk/nextjs/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '@/lib/db'
import { ensureRepairActionFields } from '@/lib/repair-action-fields'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function clean(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeStatus(value) {
  const status = clean(value).toLowerCase().replace(/[\s-]+/g, '_')
  return ['open', 'in_progress', 'completed', 'closed'].includes(status) ? status : 'open'
}

function photoUrlsFromBody(value) {
  if (Array.isArray(value)) return value.filter((url) => typeof url === 'string' && url.trim())
  if (typeof value === 'string' && value.trim()) return [value.trim()]
  return []
}

export async function POST(request) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (!getPgUrl()) return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
    await ensureDatabase()
    await ensureRepairActionFields(sql)

    const user = await currentUser().catch(() => null)
    const body = await request.json().catch(() => ({}))
    const estateBlock = clean(body.estate_block)
    const location = clean(body.location)
    const description = clean(body.description)
    const jobNumber = clean(body.job_number)
    const expectedCompletionDate = clean(body.expected_completion_date)
    const status = normalizeStatus(body.status)
    const repairNotes = clean(body.repair_notes)
    const photoUrls = photoUrlsFromBody(body.photo_urls || body.repair_photo_url)
    const primaryPhotoUrl = photoUrls[0] || null

    if (!estateBlock) {
      return NextResponse.json({ error: 'Estate/block is required' }, { status: 400 })
    }
    if (!location) {
      return NextResponse.json({ error: 'Location is required' }, { status: 400 })
    }
    if (!description) {
      return NextResponse.json({ error: 'Repair issue/description is required' }, { status: 400 })
    }

    const now = Date.now()
    const random = Math.random().toString(36).slice(2, 9)
    const inspectionId = `repair_inspection_${now}_${random}`
    const actionId = `action_${inspectionId}_repair_${now}`
    const inspectorName =
      user?.fullName ||
      [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
      user?.primaryEmailAddress?.emailAddress ||
      userId
    const inspectorEmail = user?.primaryEmailAddress?.emailAddress || userId

    await sql`
      INSERT INTO inspections (
        id, type, location_label, inspector_name, inspector_id,
        template_id, template_name, submitted_at, status, is_scheduled,
        title, description
      )
      VALUES (
        ${inspectionId}, 'repairs_inspector', ${estateBlock}, ${inspectorName}, ${inspectorEmail},
        'repairs_inspector_direct', 'Repairs Inspector Form', CURRENT_TIMESTAMP, 'submitted', false,
        ${`Repairs Inspector - ${estateBlock}`}, ${description}
      )
    `

    await sql`
      INSERT INTO actions (
        id, inspection_id, section_id, section_name, question_id,
        category, priority, title, description, location, status,
        comment, auto_created, photo_urls, job_number, expected_completion_date,
        repair_notes, repair_photo_url, repair_updated_at
      )
      VALUES (
        ${actionId}, ${inspectionId}, 'repairs_inspector', 'Repairs Inspector Form', 'repair_issue',
        'repairs', null, ${description.slice(0, 500)}, ${description}, ${location}, ${status},
        ${repairNotes || null}, false, ${JSON.stringify(photoUrls)}, ${jobNumber || null},
        ${expectedCompletionDate || null}, ${repairNotes || null}, ${primaryPhotoUrl},
        CURRENT_TIMESTAMP
      )
      RETURNING *
    `

    return NextResponse.json(
      {
        success: true,
        inspection_id: inspectionId,
        action_id: actionId,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('[repairs-inspector/create] POST:', error)
    return NextResponse.json(
      { error: 'Failed to create repair action', details: error?.message || String(error) },
      { status: 500 }
    )
  }
}
