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
  let debugPayload = null
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (!getPgUrl()) return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
    await ensureDatabase()
    const repairFieldsAvailable = await ensureRepairActionFields(sql)
    if (!repairFieldsAvailable) {
      throw new Error('Repair action columns could not be verified or created on actions table')
    }

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
    debugPayload = {
      estate_id: estateId || null,
      block_id: blockId || null,
      estate_block: estateBlock || null,
      area: area || null,
      location: location || null,
      description_present: Boolean(description),
      job_number: jobNumber || null,
      expected_completion_date: expectedCompletionDate,
      status,
      repair_notes_present: Boolean(repairNotes),
      photo_url_count: photoUrls.length,
    }

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
      const locationQuerySql = blockId
        ? 'SELECT b.id AS block_id, b.name AS block_name, e.id AS estate_id, e.name AS estate_name, e.area AS estate_area FROM blocks b LEFT JOIN estates e ON e.id = b.estate_id WHERE b.id = $1::text LIMIT 1'
        : 'SELECT NULL::text AS block_id, NULL::text AS block_name, e.id AS estate_id, e.name AS estate_name, e.area AS estate_area FROM estates e WHERE e.id = $1::text LIMIT 1'
      console.log('[repairs-inspector/create] location lookup:', {
        query: locationQuerySql,
        payload: debugPayload,
      })
      const locationResult = blockId
        ? await sql`
            SELECT
              b.id AS block_id,
              b.name AS block_name,
              e.id AS estate_id,
              e.name AS estate_name,
              e.area AS estate_area
            FROM blocks b
            LEFT JOIN estates e ON e.id = b.estate_id
            WHERE b.id = ${blockId}::text
            LIMIT 1
          `
        : await sql`
            SELECT
              NULL::text AS block_id,
              NULL::text AS block_name,
              e.id AS estate_id,
              e.name AS estate_name,
              e.area AS estate_area
            FROM estates e
            WHERE e.id = ${estateId}::text
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

    console.log('[repairs-inspector/create] inspection insert:', {
      query:
        'INSERT INTO inspections (id, type, location_label, inspector_name, inspector_id, template_id, template_name, submitted_at, status, is_scheduled, title, description, estate_id, block_id, work_type) VALUES ($1::text, $2::text, $3::text, $4::text, $5::text, $6::text, $7::text, CURRENT_TIMESTAMP, $8::text, $9::boolean, $10::text, $11::text, $12::text, $13::text, $14::text)',
      payload: debugPayload,
    })
    try {
      await sql`
        INSERT INTO inspections (
          id, type, location_label, inspector_name, inspector_id,
          template_id, template_name, submitted_at, status, is_scheduled,
          title, description, estate_id, block_id, work_type
        )
        VALUES (
          ${inspectionId}::text, 'repairs_inspector', ${linkedLocation.label || estateBlock}::text, ${inspectorName}::text, ${inspectorEmail}::text,
          'repairs_inspector_direct', 'Repairs Inspector Form', CURRENT_TIMESTAMP, 'submitted', false,
          ${`Repairs Inspector - ${linkedLocation.label || estateBlock}`}::text, ${description}::text,
          ${linkedLocation.estate_id}::text, ${linkedLocation.block_id}::text, 'repairs_inspector'
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
          ${inspectionId}::text, 'repairs_inspector', ${linkedLocation.label || estateBlock}::text, ${inspectorName}::text, ${inspectorEmail}::text,
          'repairs_inspector_direct', 'Repairs Inspector Form', CURRENT_TIMESTAMP, 'submitted', false,
          ${`Repairs Inspector - ${linkedLocation.label || estateBlock}`}::text, ${description}::text
        )
      `
    }

    console.log('[repairs-inspector/create] action insert:', {
      query:
        'INSERT INTO actions (id, inspection_id, section_id, section_name, question_id, category, priority, title, description, location, status, comment, auto_created, photo_urls, block_id, job_number, expected_completion_date, repair_notes, repair_photo_url, repair_updated_at) VALUES ($1::text, $2::text, $3::text, $4::text, $5::text, $6::text, NULL, $7::text, $8::text, $9::text, $10::text, $11::text, $12::boolean, $13::jsonb, $14::text, $15::text, $16::date, $17::text, $18::text, CURRENT_TIMESTAMP)',
      payload: debugPayload,
    })
    await sql`
      INSERT INTO actions (
        id, inspection_id, section_id, section_name, question_id,
        category, priority, title, description, location, status,
        comment, auto_created, photo_urls, block_id, job_number, expected_completion_date,
        repair_notes, repair_photo_url, repair_updated_at
      )
      VALUES (
        ${actionId}::text, ${inspectionId}::text, 'repairs_inspector', 'Repairs Inspector Form', 'repair_issue',
        'repairs', null, ${description.slice(0, 500)}::text, ${description}::text, ${location}::text, ${status}::text,
        ${repairNotes || null}::text, false, ${JSON.stringify(photoUrls)}::jsonb, ${linkedLocation.block_id}::text, ${jobNumber || null}::text,
        ${expectedCompletionDate}::date, ${repairNotes || null}::text, ${primaryPhotoUrl}::text,
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
    console.error('[repairs-inspector/create] POST failed:', { error: message, payload: debugPayload })
    return NextResponse.json(
      { error: message, details: message },
      { status: 500 }
    )
  }
}
