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

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET - Fetch all actions
export async function GET(request) {
  let searchParams
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const cu = await currentUser()
    const roleCtx = await getAppRoleContextForClerkUser(userId, cu?.publicMetadata?.isAdmin === true)

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

    const globalList = !inspectionId
    if (globalList && !roleMayViewGlobalActionsList(roleCtx.normalized, roleCtx.clerkIsAdmin)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    
    let result
    try {
      let query
      if (inspectionId && questionId) {
        query = sql`
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
            'Inspector' AS created_by,
            'Assigned' AS assigned_to
          FROM actions a
          WHERE a.inspection_id = ${inspectionId} AND a.question_id = ${questionId}
          ORDER BY a.created_at DESC
        `
      } else if (inspectionId) {
        query = sql`
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
            'Inspector' AS created_by,
            'Assigned' AS assigned_to
          FROM actions a
          WHERE a.inspection_id = ${inspectionId}
          ORDER BY a.created_at DESC
        `
      } else {
        query = sql`
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
            'Inspector' AS created_by,
            'Assigned' AS assigned_to
          FROM actions a
          ORDER BY a.created_at DESC
          LIMIT 1000
        `
      }
      
      result = await query
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
              'Inspector' AS created_by,
              'Assigned' AS assigned_to
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
              'Inspector' AS created_by,
              'Assigned' AS assigned_to
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
              'Inspector' AS created_by,
              'Assigned' AS assigned_to
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
    const roleCtx = await getAppRoleContextForClerkUser(userId, cu?.publicMetadata?.isAdmin === true)
    if (!roleMayPostManualAction(roleCtx.normalized, roleCtx.clerkIsAdmin)) {
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
