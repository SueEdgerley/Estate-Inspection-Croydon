import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '@/lib/db'
import { getAppAdminAccess } from '@/lib/app-admin-access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Preflight for permanent user removal: counts and blockers (self-delete, last owner).
 * Inspections keep inspector_name / inspector_id (email) — no FK to users.
 */
export async function GET(request, { params }) {
  const access = await getAppAdminAccess()
  if (!access.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!access.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!getPgUrl()) return NextResponse.json({ error: 'Database not configured' }, { status: 503 })

  const id = params?.id
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  try {
    await ensureDatabase()

    const me = await sql`SELECT id FROM users WHERE clerk_user_id = ${access.userId} LIMIT 1`
    const myInternalId = me.rows[0]?.id ?? null

    const u = (
      await sql`
        SELECT id, clerk_user_id, email,
          COALESCE(system_role, CASE
            WHEN lower(trim(COALESCE(role, ''))) = 'owner' THEN 'owner'
            WHEN lower(trim(COALESCE(role, ''))) = 'admin' THEN 'admin'
            ELSE 'user'
          END) AS system_role,
          COALESCE(system_role, CASE
            WHEN lower(trim(COALESCE(role, ''))) = 'owner' THEN 'owner'
            WHEN lower(trim(COALESCE(role, ''))) = 'admin' THEN 'admin'
            ELSE 'user'
          END) AS role,
          COALESCE(is_active, true) AS is_active
        FROM users WHERE id = ${id} LIMIT 1
      `
    ).rows[0]

    if (!u) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const email = (u.email && String(u.email).trim().toLowerCase()) || ''
    const clerkId = u.clerk_user_id ? String(u.clerk_user_id).trim() : ''

    const emailMatch = email || null
    const clerkMatch = clerkId || null

    const inspectionCount = (
      await sql`
        SELECT COUNT(*)::int AS c FROM inspections
        WHERE inspector_id IS NOT NULL
          AND (
            (${emailMatch}::text IS NOT NULL AND lower(trim(inspector_id)) = lower(${emailMatch}))
            OR (${clerkMatch}::text IS NOT NULL AND trim(inspector_id) = ${clerkMatch})
            OR trim(inspector_id) = ${id}
          )
      `
    ).rows[0]?.c ?? 0

    const ownerCount = (
      await sql`
        SELECT COUNT(*)::int AS c FROM users
        WHERE lower(trim(COALESCE(system_role, role))) = 'owner' AND COALESCE(is_active, true) = true
      `
    ).rows[0]?.c ?? 0

    const isOwner = String(u.system_role || u.role || '').toLowerCase().trim() === 'owner' && u.is_active !== false
    const lastOwner = isOwner && ownerCount <= 1

    const blockers = []
    if (myInternalId && id === myInternalId) {
      blockers.push({ code: 'cannot_delete_self', message: 'You cannot delete your own account from here.' })
    }
    if (lastOwner) {
      blockers.push({
        code: 'last_owner',
        message: 'Cannot delete the only active owner account. Promote another owner first.',
      })
    }

    return NextResponse.json({
      user: {
        id: u.id,
        email: u.email,
        clerk_user_id: u.clerk_user_id,
        role: u.role,
        is_active: u.is_active,
      },
      counts: {
        inspectionsMatchingInspectorId: inspectionCount,
      },
      notes: [
        'DELETE /api/admin/users/:id removes only the `users` row in this app database (no Clerk API call). Revoke Clerk access separately if needed.',
        'Inspections store inspector name and email on each row — they are not foreign-keyed to users, so deleting this login does not remove past inspection records.',
        'Staff directory (`people`) is separate and is not modified by this action.',
      ],
      canDelete: blockers.length === 0,
      blockers,
    })
  } catch (e) {
    console.error('[admin/users/delete-impact]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
