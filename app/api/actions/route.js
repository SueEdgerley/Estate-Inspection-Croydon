import { NextResponse } from 'next/server'
import { auth, currentUser } from '@clerk/nextjs/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '@/lib/db'
import {
  getAppRoleContextForClerkUser,
  roleMayPostManualAction,
  roleMayViewGlobalActionsList,
} from '@/lib/app-role-access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET - Fetch all actions
export async function GET(request) {
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
    const { searchParams } = new URL(request.url)
    const inspectionId = searchParams.get('inspection_id')
    const questionId = searchParams.get('question_id')

    const globalList = !inspectionId
    if (globalList && !roleMayViewGlobalActionsList(roleCtx.normalized, roleCtx.clerkIsAdmin)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    
    let query
    if (inspectionId && questionId) {
      query = sql`
        SELECT 
          a.id, a.inspection_id, a.section_id, a.section_name, a.question_id,
          a.category, a.priority, a.title, a.description,
          COALESCE(a.location, NULLIF(CONCAT_WS(' / ', e.name, b.name), ''), i.location_label) AS location,
          a.status, a.comment, a.recipient_person_id, a.auto_created,
          a.block_id, a.cost_code,
          a.created_at, a.updated_at, a.expected_completion_date,
          COALESCE(i.inspector_name, u.email, i.inspector_id) AS created_by,
          rp.name AS assigned_to
        FROM actions a
        LEFT JOIN inspections i ON i.id = a.inspection_id
        LEFT JOIN estates e ON e.id = i.estate_id
        LEFT JOIN blocks b ON b.id = i.block_id
        LEFT JOIN users u ON u.clerk_user_id = i.inspector_id
        LEFT JOIN people rp ON rp.id = a.recipient_person_id
        WHERE a.inspection_id = ${inspectionId} AND a.question_id = ${questionId}
        ORDER BY created_at DESC
      `
    } else if (inspectionId) {
      query = sql`
        SELECT 
          a.id, a.inspection_id, a.section_id, a.section_name, a.question_id,
          a.category, a.priority, a.title, a.description,
          COALESCE(a.location, NULLIF(CONCAT_WS(' / ', e.name, b.name), ''), i.location_label) AS location,
          a.status, a.comment, a.recipient_person_id, a.auto_created,
          a.block_id, a.cost_code,
          a.created_at, a.updated_at, a.expected_completion_date,
          COALESCE(i.inspector_name, u.email, i.inspector_id) AS created_by,
          rp.name AS assigned_to
        FROM actions a
        LEFT JOIN inspections i ON i.id = a.inspection_id
        LEFT JOIN estates e ON e.id = i.estate_id
        LEFT JOIN blocks b ON b.id = i.block_id
        LEFT JOIN users u ON u.clerk_user_id = i.inspector_id
        LEFT JOIN people rp ON rp.id = a.recipient_person_id
        WHERE a.inspection_id = ${inspectionId}
        ORDER BY created_at DESC
      `
    } else {
      query = sql`
        SELECT 
          a.id, a.inspection_id, a.section_id, a.section_name, a.question_id,
          a.category, a.priority, a.title, a.description,
          COALESCE(a.location, NULLIF(CONCAT_WS(' / ', e.name, b.name), ''), i.location_label) AS location,
          a.status, a.comment, a.recipient_person_id, a.auto_created,
          a.block_id, a.cost_code,
          a.created_at, a.updated_at, a.expected_completion_date,
          COALESCE(i.inspector_name, u.email, i.inspector_id) AS created_by,
          rp.name AS assigned_to
        FROM actions a
        LEFT JOIN inspections i ON i.id = a.inspection_id
        LEFT JOIN estates e ON e.id = i.estate_id
        LEFT JOIN blocks b ON b.id = i.block_id
        LEFT JOIN users u ON u.clerk_user_id = i.inspector_id
        LEFT JOIN people rp ON rp.id = a.recipient_person_id
        ORDER BY a.created_at DESC
      `
    }
    
    const result = await query
    return NextResponse.json(result.rows)
  } catch (error) {
    console.error('Error fetching actions:', error)
    return NextResponse.json(
      { error: 'Failed to fetch actions', details: error.message },
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
        expected_completion_date
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
        ${expectedCompletionDate}
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
