import { NextResponse } from 'next/server'
import { auth, currentUser } from '@clerk/nextjs/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '@/lib/db'
import { getCurrentUserEmail, getCurrentUserName } from '@/lib/auth'
import { getAppRoleContextForClerkUser } from '@/lib/app-role-access'
import {
  canAddInspectionFollowUpUpdate,
  canViewInspectionFollowUpUpdates,
  mapInspectionUpdateRow,
} from '@/lib/inspection-follow-up-updates'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function loadInspection(inspectionId) {
  const result = await sql`SELECT * FROM inspections WHERE id = ${inspectionId} LIMIT 1`
  return result.rows[0] || null
}

export async function GET(_request, { params }) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    await ensureDatabase()
    if (!getPgUrl()) {
      return NextResponse.json({ error: 'Database not configured.' }, { status: 503 })
    }

    const { id } = await params
    const inspection = await loadInspection(id)
    if (!inspection) {
      return NextResponse.json({ error: 'Inspection not found' }, { status: 404 })
    }

    const cu = await currentUser()
    const roleCtx = await getAppRoleContextForClerkUser(userId, cu?.publicMetadata?.isAdmin === true)
    const userEmail = await getCurrentUserEmail()
    if (!canViewInspectionFollowUpUpdates({ roleCtx, userEmail, inspection })) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const rows = await sql`
      SELECT id, inspection_id, author_email, author_name, body, created_at
      FROM inspection_updates
      WHERE inspection_id = ${id}
      ORDER BY created_at ASC
    `
    return NextResponse.json({
      updates: rows.rows.map(mapInspectionUpdateRow).filter(Boolean),
    })
  } catch (error) {
    console.error('[inspections/updates GET]', error)
    return NextResponse.json(
      { error: 'Failed to load updates', details: error?.message || String(error) },
      { status: 500 }
    )
  }
}

export async function POST(request, { params }) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    await ensureDatabase()
    if (!getPgUrl()) {
      return NextResponse.json({ error: 'Database not configured.' }, { status: 503 })
    }

    const { id } = await params
    const inspection = await loadInspection(id)
    if (!inspection) {
      return NextResponse.json({ error: 'Inspection not found' }, { status: 404 })
    }

    const cu = await currentUser()
    const roleCtx = await getAppRoleContextForClerkUser(userId, cu?.publicMetadata?.isAdmin === true)
    const userEmail = await getCurrentUserEmail()
    const userName = await getCurrentUserName()

    if (!canAddInspectionFollowUpUpdate({ roleCtx, userEmail, inspection })) {
      return NextResponse.json(
        { error: 'You can only add follow-up notes to your own submitted caretaker inspections.' },
        { status: 403 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const text = typeof body?.body === 'string' ? body.body.trim() : ''
    if (!text) {
      return NextResponse.json({ error: 'Please enter an update note.' }, { status: 400 })
    }
    if (text.length > 4000) {
      return NextResponse.json({ error: 'Update note is too long (max 4000 characters).' }, { status: 400 })
    }

    const updateId = `insp_upd_${id}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
    const created = await sql`
      INSERT INTO inspection_updates (id, inspection_id, author_email, author_name, body)
      VALUES (
        ${updateId},
        ${id},
        ${userEmail || 'unknown'},
        ${userName || null},
        ${text}
      )
      RETURNING id, inspection_id, author_email, author_name, body, created_at
    `

    return NextResponse.json(
      { update: mapInspectionUpdateRow(created.rows[0]) },
      { status: 201 }
    )
  } catch (error) {
    console.error('[inspections/updates POST]', error)
    return NextResponse.json(
      { error: 'Failed to save update', details: error?.message || String(error) },
      { status: 500 }
    )
  }
}
