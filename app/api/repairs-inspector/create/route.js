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

function normalizeDateOnly(value) {
  const date = clean(value)
  if (!date) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('Expected completion date must be in YYYY-MM-DD format')
  }
  return date
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
    const repairFieldsAvailable = await ensureRepairActionFields(sql)

    const user = await currentUser().catch(() => null)
    const body = await request.json().catch(() => ({}))
    const estateId = clean(body.estate_id)
    const blockId = clean(body.block_id)
    const estateBlock = clean(body.estate_block)
    const area = clean(body.area)
    const location = clean(body.location)
    const description = clean(body.description)
    const jobNumber = clean(body.job_number)
    const expectedCompletionDate = normalizeDateOnly(body.expected_completion_date)
    const status = normalizeStatus(body.status)
    const repairNotes = clean(body.repair_notes)
    const photoUrls = photoUrlsFromBody(body.photo_urls || body.repair_photo_url)
    const primaryPhotoUrl = photoUrls[0] || null

    if (!estateBlock && !estateId && !blockId) {
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
    let linkedLocation = {
      estate_id: null,
      block_id: null,
      label: estateBlock,
      area,
    }

    if (blockId || estateId) {
      const locationResult = await sql`
        SELECT
          b.id AS block_id,
          b.name AS block_name,
          e.id AS estate_id,
          e.name AS estate_name,
          e.area AS estate_area
        FROM blocks b
        FULL OUTER JOIN estates e ON e.id = b.estate_id
        WHERE (${blockId || null} IS NOT NULL AND b.id = ${blockId || null})
          OR (${blockId || null} IS NULL AND ${estateId || null} IS NOT NULL AND e.id = ${estateId || null})
        LIMIT 1
      `
      const row = locationResult.rows[0]
      if (row) {
        linkedLocation = {
          estate_id: row.estate_id || estateId || null,
          block_id: row.block_id || blockId || null,
          label: [row.estate_name, row.block_name].filter(Boolean).join(' / ') || estateBlock,
          area: row.estate_area || area,
        }
      } else {
        console.warn('[repairs-inspector/create] submitted estate/block was not found; saving repair with text location only', {
          estateId,
          blockId,
        })
      }
    }

    try {
      await sql`
        INSERT INTO inspections (
          id, type, location_label, inspector_name, inspector_id,
          template_id, template_name, submitted_at, status, is_scheduled,
          title, description, estate_id, block_id, work_type
        )
        VALUES (
          ${inspectionId}, 'repairs_inspector', ${linkedLocation.label || estateBlock}, ${inspectorName}, ${inspectorEmail},
          'repairs_inspector_direct', 'Repairs Inspector Form', CURRENT_TIMESTAMP, 'submitted', false,
          ${`Repairs Inspector - ${linkedLocation.label || estateBlock}`}, ${description},
          ${linkedLocation.estate_id}, ${linkedLocation.block_id}, 'repairs_inspector'
        )
      `
    } catch (inspectionInsertError) {
      console.warn('[repairs-inspector/create] full inspection insert failed; retrying core inspection insert:', inspectionInsertError?.message || inspectionInsertError)
      await sql`
        INSERT INTO inspections (
          id, type, location_label, inspector_name, inspector_id,
          template_id, template_name, submitted_at, status, is_scheduled,
          title, description
        )
        VALUES (
          ${inspectionId}, 'repairs_inspector', ${linkedLocation.label || estateBlock}, ${inspectorName}, ${inspectorEmail},
          'repairs_inspector_direct', 'Repairs Inspector Form', CURRENT_TIMESTAMP, 'submitted', false,
          ${`Repairs Inspector - ${linkedLocation.label || estateBlock}`}, ${description}
        )
      `
    }

    if (!repairFieldsAvailable) {
      throw new Error('Repair action columns could not be verified or created on actions table')
    }

    await sql`
      INSERT INTO actions (
        id, inspection_id, section_id, section_name, question_id,
        category, priority, title, description, location, status,
        comment, auto_created, photo_urls, block_id, job_number, expected_completion_date,
        repair_notes, repair_photo_url, repair_updated_at
      )
      VALUES (
        ${actionId}, ${inspectionId}, 'repairs_inspector', 'Repairs Inspector Form', 'repair_issue',
        'repairs', null, ${description.slice(0, 500)}, ${description}, ${location}, ${status},
        ${repairNotes || null}, false, ${JSON.stringify(photoUrls)}, ${linkedLocation.block_id}, ${jobNumber || null},
        ${expectedCompletionDate}, ${repairNotes || null}, ${primaryPhotoUrl},
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
    const message = error?.message || String(error)
    console.error('[repairs-inspector/create] POST failed:', message)
    return NextResponse.json(
      { error: message, details: message },
      { status: 500 }
    )
  }
}
