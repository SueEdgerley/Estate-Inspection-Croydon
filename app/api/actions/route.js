import { NextResponse } from 'next/server'
import { auth, currentUser } from '@clerk/nextjs/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '@/lib/db'
import {
  getAppRoleContextForClerkUser,
  roleMayPostManualAction,
  roleMayViewGlobalActionsList,
} from '@/lib/app-role-access'
import { ensureRepairActionFields } from '@/lib/repair-action-fields'
import { getRequestTrace, logAccessTrace, roleTrace } from '@/lib/access-trace'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const OPTIONAL_INSPECTION_COLUMNS = [
  'form_name',
  'completed_by_name',
  'created_by_name',
  'user_email',
  'address',
  'location',
]

async function getAvailableInspectionColumns() {
  try {
    const result = await sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'inspections'
        AND column_name = ANY(${OPTIONAL_INSPECTION_COLUMNS})
    `
    return new Set((result.rows || []).map((row) => row.column_name))
  } catch (error) {
    console.warn('[Actions API] inspection column lookup failed:', error?.message || error)
    return new Set()
  }
}

function optionalInspectionColumn(availableColumns, columnName) {
  return availableColumns.has(columnName) ? `i.${columnName}` : 'NULL::text'
}

function currentUserDisplayName(user) {
  return [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() || user?.fullName || null
}

function currentUserEmail(user) {
  return user?.primaryEmailAddress?.emailAddress || user?.emailAddresses?.[0]?.emailAddress || null
}

function buildActionsSelect({ where = '', limit = '', availableInspectionColumns }) {
  const inspectionFormName = optionalInspectionColumn(availableInspectionColumns, 'form_name')
  const inspectionCompletedByName = optionalInspectionColumn(availableInspectionColumns, 'completed_by_name')
  const inspectionCreatedByName = optionalInspectionColumn(availableInspectionColumns, 'created_by_name')
  const inspectionUserEmail = optionalInspectionColumn(availableInspectionColumns, 'user_email')
  const inspectionAddress = optionalInspectionColumn(availableInspectionColumns, 'address')
  const inspectionLocation = optionalInspectionColumn(availableInspectionColumns, 'location')

  return `
    SELECT
      a.id, a.inspection_id, a.section_id, a.section_name, a.question_id,
      a.category, a.priority, a.title, a.description,
      a.location,
      a.status, a.comment, a.recipient_person_id, a.auto_created,
      a.photo_urls,
      a.block_id, a.cost_code, a.issue_pdf_url,
      a.job_number, a.expected_completion_date,
      a.repair_notes, a.repair_photo_url, a.repair_updated_at,
      a.created_at, a.updated_at,
      COALESCE(
        CASE WHEN lower(trim(COALESCE(i.inspector_name, ''))) <> 'inspector' THEN NULLIF(trim(i.inspector_name), '') END,
        NULLIF(trim(${inspectionCompletedByName}), ''),
        NULLIF(trim(${inspectionCreatedByName}), ''),
        NULLIF(trim(completed_person.name), ''),
        NULLIF(trim(completed_user.email), ''),
        NULLIF(trim($1), ''),
        NULLIF(trim(${inspectionUserEmail}), ''),
        NULLIF(trim($2), ''),
        CASE WHEN i.inspector_id LIKE '%@%' THEN NULLIF(trim(i.inspector_id), '') END
      ) AS created_by,
      p.name AS assigned_to,
      p.email AS assigned_to_email,
      i.title AS inspection_title,
      i.template_name AS inspection_template_name,
      tv.snapshot->>'title' AS template_title,
      COALESCE(tv.snapshot->>'name', tv.template_name) AS template_name,
      ${inspectionFormName} AS inspection_form_name,
      i.type AS inspection_type,
      i.source AS inspection_source,
      i.location_label AS inspection_location_label,
      ${inspectionAddress} AS inspection_address,
      ${inspectionLocation} AS inspection_location,
      CASE WHEN lower(trim(COALESCE(i.inspector_name, ''))) <> 'inspector' THEN NULLIF(trim(i.inspector_name), '') END AS inspection_inspector_name,
      ${inspectionCompletedByName} AS inspection_completed_by_name,
      ${inspectionCreatedByName} AS inspection_created_by_name,
      ${inspectionUserEmail} AS inspection_user_email,
      NULLIF(trim(completed_user.email), '') AS inspection_inspector_email,
      NULLIF(trim(i.inspector_id), '') AS inspection_inspector_id,
      NULLIF(trim($1), '') AS current_user_name,
      NULLIF(trim($2), '') AS current_user_email,
      i.due_date AS inspection_due_date,
      i.submitted_at AS inspection_submitted_at,
      i.created_at AS inspection_created_at,
      e.name AS estate_name,
      b.name AS block_name,
      COALESCE(
        NULLIF(CONCAT_WS(' / ', e.name, b.name), ''),
        i.location_label,
        ${inspectionAddress},
        ${inspectionLocation},
        i.title
      ) AS estate_block_name
    FROM actions a
    LEFT JOIN inspections i ON i.id = a.inspection_id
    LEFT JOIN template_versions tv ON tv.id = i.template_version_id
    LEFT JOIN users completed_user ON completed_user.clerk_user_id = i.inspector_id OR lower(trim(completed_user.email)) = lower(trim(i.inspector_id))
    LEFT JOIN people completed_person ON completed_person.id = completed_user.people_id OR lower(trim(completed_person.email)) = lower(trim(COALESCE(completed_user.email, i.inspector_id, '')))
    LEFT JOIN estates e ON e.id = i.estate_id
    LEFT JOIN blocks b ON b.id = COALESCE(a.block_id, i.block_id)
    LEFT JOIN people p ON p.id = a.recipient_person_id
    ${where}
    ORDER BY a.created_at DESC
    ${limit}
  `
}

// GET - Fetch all actions
export async function GET(request) {
  let searchParams
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const cu = await currentUser()
    const roleCtx = await getAppRoleContextForClerkUser(
      userId,
      cu?.publicMetadata?.isAdmin === true,
      { ...cu?.publicMetadata, ...cu?.privateMetadata, ...cu?.unsafeMetadata }
    )

    await ensureDatabase()
    const pgUrl = getPgUrl()
    if (!pgUrl) {
      return NextResponse.json(
        { error: 'Database not configured. Please set up Postgres.' },
        { status: 503 }
      )
    }
    searchParams = new URL(request.url).searchParams
    const inspectionId = searchParams.get('inspection_id')
    const questionId = searchParams.get('question_id')
    let actionInspectionTrace = {}
    if (inspectionId) {
      try {
        const inspectionTraceResult = await sql`
          SELECT id, template_id, template_name, type, source
          FROM inspections
          WHERE id = ${inspectionId}
          LIMIT 1
        `
        const inspectionTraceRow = inspectionTraceResult.rows[0] || null
        actionInspectionTrace = {
          inspection_template_id: inspectionTraceRow?.template_id || null,
          template_name: inspectionTraceRow?.template_name || null,
          inspection_type: inspectionTraceRow?.type || null,
          inspection_source: inspectionTraceRow?.source || null,
        }
      } catch (traceError) {
        actionInspectionTrace = { inspection_trace_error: traceError?.message || String(traceError) }
      }
    }

    const globalList = !inspectionId
    const mayViewActions = !globalList || roleMayViewGlobalActionsList(roleCtx.normalized, roleCtx.clerkIsAdmin)
    logAccessTrace('api.actions.get.permission', {
      ...getRequestTrace(request),
      user_id: userId,
      inspection_id: inspectionId || null,
      question_id: questionId || null,
      global_list: globalList,
      ...actionInspectionTrace,
      ...roleTrace(roleCtx),
      permission: globalList ? 'roleMayViewGlobalActionsList' : 'inspection_actions_read',
      allowed: mayViewActions,
    })
    if (!mayViewActions) {
      logAccessTrace('api.actions.get.forbidden', {
        ...getRequestTrace(request),
        user_id: userId,
        inspection_id: inspectionId || null,
        ...actionInspectionTrace,
        ...roleTrace(roleCtx),
        failure_source: '/api/actions',
      })
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    
    let result
    try {
      const availableInspectionColumns = await getAvailableInspectionColumns()
      const currentUserName = currentUserDisplayName(cu)
      const clerkEmail = currentUserEmail(cu)
      const queryParams = [currentUserName, clerkEmail]
      let queryText
      if (inspectionId && questionId) {
        queryParams.push(inspectionId, questionId)
        queryText = buildActionsSelect({
          availableInspectionColumns,
          where: 'WHERE a.inspection_id = $3 AND a.question_id = $4',
        })
      } else if (inspectionId) {
        queryParams.push(inspectionId)
        queryText = buildActionsSelect({
          availableInspectionColumns,
          where: 'WHERE a.inspection_id = $3',
        })
      } else {
        queryText = buildActionsSelect({
          availableInspectionColumns,
          limit: 'LIMIT 1000',
        })
      }
      
      result = await sql.query(queryText, queryParams)
      if (inspectionId && !questionId) {
        console.log('[Actions API] Query successful for inspection_id:', inspectionId, '- found', result.rows.length, 'actions')
      }
    } catch (dbError) {
      console.error('[Actions API] Query failed for inspection_id:', inspectionId, 'error:', dbError?.message || dbError)
      try {
        let fallbackQuery
        if (inspectionId && questionId) {
          fallbackQuery = sql`
            SELECT
              a.id, a.inspection_id, a.section_id, a.section_name, a.question_id,
              a.category, a.priority, a.title, a.description, a.location,
              a.status, a.comment, a.recipient_person_id, a.auto_created,
              a.photo_urls,
              NULL::varchar AS block_id,
              NULL::varchar AS cost_code,
              NULL::text AS issue_pdf_url,
              a.job_number, a.expected_completion_date,
              NULL::text AS repair_notes,
              NULL::text AS repair_photo_url,
              NULL::timestamptz AS repair_updated_at,
              a.created_at, a.updated_at,
              NULL::text AS created_by,
              'Assigned' AS assigned_to,
              NULL::text AS assigned_to_email,
              NULL::text AS inspection_title,
              NULL::text AS inspection_template_name,
              NULL::text AS template_title,
              NULL::text AS template_name,
              NULL::text AS inspection_form_name,
              NULL::text AS inspection_type,
              NULL::text AS inspection_source,
              NULL::text AS inspection_location_label,
              NULL::text AS inspection_address,
              NULL::text AS inspection_location,
              NULL::text AS inspection_inspector_name,
              NULL::text AS inspection_completed_by_name,
              NULL::text AS inspection_created_by_name,
              NULL::text AS inspection_user_email,
              NULL::text AS inspection_inspector_email,
              NULL::text AS inspection_inspector_id,
              NULL::text AS current_user_name,
              NULL::text AS current_user_email,
              NULL::timestamptz AS inspection_due_date,
              NULL::timestamptz AS inspection_submitted_at,
              NULL::timestamptz AS inspection_created_at,
              NULL::text AS estate_name,
              NULL::text AS block_name,
              NULL::text AS estate_block_name
            FROM actions a
            WHERE a.inspection_id = ${inspectionId} AND a.question_id = ${questionId}
            ORDER BY a.created_at DESC
          `
        } else if (inspectionId) {
          fallbackQuery = sql`
            SELECT
              a.id, a.inspection_id, a.section_id, a.section_name, a.question_id,
              a.category, a.priority, a.title, a.description, a.location,
              a.status, a.comment, a.recipient_person_id, a.auto_created,
              a.photo_urls,
              NULL::varchar AS block_id,
              NULL::varchar AS cost_code,
              NULL::text AS issue_pdf_url,
              a.job_number, a.expected_completion_date,
              NULL::text AS repair_notes,
              NULL::text AS repair_photo_url,
              NULL::timestamptz AS repair_updated_at,
              a.created_at, a.updated_at,
              NULL::text AS created_by,
              'Assigned' AS assigned_to,
              NULL::text AS assigned_to_email,
              NULL::text AS inspection_title,
              NULL::text AS inspection_template_name,
              NULL::text AS template_title,
              NULL::text AS template_name,
              NULL::text AS inspection_form_name,
              NULL::text AS inspection_type,
              NULL::text AS inspection_source,
              NULL::text AS inspection_location_label,
              NULL::text AS inspection_address,
              NULL::text AS inspection_location,
              NULL::text AS inspection_inspector_name,
              NULL::text AS inspection_completed_by_name,
              NULL::text AS inspection_created_by_name,
              NULL::text AS inspection_user_email,
              NULL::text AS inspection_inspector_email,
              NULL::text AS inspection_inspector_id,
              NULL::text AS current_user_name,
              NULL::text AS current_user_email,
              NULL::timestamptz AS inspection_due_date,
              NULL::timestamptz AS inspection_submitted_at,
              NULL::timestamptz AS inspection_created_at,
              NULL::text AS estate_name,
              NULL::text AS block_name,
              NULL::text AS estate_block_name
            FROM actions a
            WHERE a.inspection_id = ${inspectionId}
            ORDER BY a.created_at DESC
          `
        } else {
          fallbackQuery = sql`
            SELECT
              a.id, a.inspection_id, a.section_id, a.section_name, a.question_id,
              a.category, a.priority, a.title, a.description, a.location,
              a.status, a.comment, a.recipient_person_id, a.auto_created,
              a.photo_urls,
              NULL::varchar AS block_id,
              NULL::varchar AS cost_code,
              NULL::text AS issue_pdf_url,
              a.job_number, a.expected_completion_date,
              NULL::text AS repair_notes,
              NULL::text AS repair_photo_url,
              NULL::timestamptz AS repair_updated_at,
              a.created_at, a.updated_at,
              NULL::text AS created_by,
              'Assigned' AS assigned_to,
              NULL::text AS assigned_to_email,
              NULL::text AS inspection_title,
              NULL::text AS inspection_template_name,
              NULL::text AS template_title,
              NULL::text AS template_name,
              NULL::text AS inspection_form_name,
              NULL::text AS inspection_type,
              NULL::text AS inspection_source,
              NULL::text AS inspection_location_label,
              NULL::text AS inspection_address,
              NULL::text AS inspection_location,
              NULL::text AS inspection_inspector_name,
              NULL::text AS inspection_completed_by_name,
              NULL::text AS inspection_created_by_name,
              NULL::text AS inspection_user_email,
              NULL::text AS inspection_inspector_email,
              NULL::text AS inspection_inspector_id,
              NULL::text AS current_user_name,
              NULL::text AS current_user_email,
              NULL::timestamptz AS inspection_due_date,
              NULL::timestamptz AS inspection_submitted_at,
              NULL::timestamptz AS inspection_created_at,
              NULL::text AS estate_name,
              NULL::text AS block_name,
              NULL::text AS estate_block_name
            FROM actions a
            ORDER BY a.created_at DESC
            LIMIT 1000
          `
        }
        result = await fallbackQuery
        console.warn(
          '[Actions API] Used core actions fallback for inspection_id:',
          inspectionId || '(global)',
          '- found',
          result.rows.length,
          'actions'
        )
      } catch (fallbackError) {
        console.error('[Actions API] Fallback query failed for inspection_id:', inspectionId, 'error:', fallbackError?.message || fallbackError)
        result = { rows: [] }
      }
    }

    return NextResponse.json(Array.isArray(result.rows) ? result.rows : result.rows || [])
  } catch (error) {
    console.error('Error fetching actions:', {
      inspectionId: searchParams?.get?.('inspection_id'),
      url: request.url,
      error: error?.message || String(error),
    })
    return NextResponse.json(
      { error: 'Failed to fetch actions', details: error?.message || String(error) },
      { status: 500 }
    )
  }
}

// POST - Create a new action
export async function POST(request) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const cu = await currentUser()
    const roleCtx = await getAppRoleContextForClerkUser(
      userId,
      cu?.publicMetadata?.isAdmin === true,
      { ...cu?.publicMetadata, ...cu?.privateMetadata, ...cu?.unsafeMetadata }
    )
    const mayPostManualAction = roleMayPostManualAction(roleCtx.normalized, roleCtx.clerkIsAdmin)
    logAccessTrace('api.actions.post.permission', {
      ...getRequestTrace(request),
      user_id: userId,
      ...roleTrace(roleCtx),
      permission: 'roleMayPostManualAction',
      allowed: mayPostManualAction,
    })
    if (!mayPostManualAction) {
      logAccessTrace('api.actions.post.forbidden', {
        ...getRequestTrace(request),
        user_id: userId,
        ...roleTrace(roleCtx),
        failure_source: '/api/actions',
      })
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await ensureDatabase()
    const pgUrl = getPgUrl()
    if (!pgUrl) {
      return NextResponse.json(
        { error: 'Database not configured. Please set up Postgres.' },
        { status: 503 }
      )
    }
    const data = await request.json()
    await ensureRepairActionFields(sql)
    
    // Generate ID if not provided
    const id = data.id || `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    let resolvedLocation = data.location || null
    if (!resolvedLocation && data.inspection_id) {
      const locRow = await sql`
        SELECT COALESCE(NULLIF(CONCAT_WS(' / ', e.name, b.name), ''), i.location_label) AS location
        FROM inspections i
        LEFT JOIN estates e ON e.id = i.estate_id
        LEFT JOIN blocks b ON b.id = i.block_id
        WHERE i.id = ${data.inspection_id}
        LIMIT 1
      `
      resolvedLocation = locRow.rows[0]?.location || null
    }
    
    const expectedCompletionDate = data.expected_completion_date
      ? data.expected_completion_date
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    const result = await sql`
      INSERT INTO actions (
        id,
        inspection_id,
        section_id,
        section_name,
        question_id,
        category,
        priority,
        title,
        description,
        location,
        status,
        comment,
        recipient_person_id,
        block_id,
        cost_code,
        auto_created,
        expected_completion_date,
        repair_notes,
        repair_photo_url,
        repair_updated_at
      ) VALUES (
        ${id},
        ${data.inspection_id || null},
        ${data.section_id || null},
        ${data.section_name || null},
        ${data.question_id || null},
        ${data.category || 'other'},
        ${data.priority || null},
        ${data.title},
        ${data.description || null},
        ${resolvedLocation},
        ${data.status || 'open'},
        ${data.comment || null},
        ${data.recipient_person_id || null},
        ${data.block_id || null},
        ${data.cost_code || null},
        ${data.auto_created || false},
        ${expectedCompletionDate},
        ${data.repair_notes || null},
        ${data.repair_photo_url || null},
        ${data.repair_notes || data.repair_photo_url ? new Date() : null}
      )
      RETURNING *
    `
    
    return NextResponse.json(result.rows[0], { status: 201 })
  } catch (error) {
    console.error('Error creating action:', error)
    return NextResponse.json(
      { error: 'Failed to create action', details: error.message },
      { status: 500 }
    )
  }
}
