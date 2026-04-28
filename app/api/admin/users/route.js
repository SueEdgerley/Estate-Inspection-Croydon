import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '@/lib/db'
import { getAppAdminAccess } from '@/lib/app-admin-access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function requireAdmin() {
  const access = await getAppAdminAccess()
  if (!access.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!access.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!getPgUrl()) return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  return null
}

/**
 * Phase 1: one row per app account (`users` only). No join to `people`.
 * - `id` = users.id (for PATCH)
 * - `role` / `system_role` = permission role only (admin/user)
 */
export async function GET() {
  const err = await requireAdmin()
  if (err) return err
  try {
    await ensureDatabase()
    const result = await sql`
      SELECT
        id,
        clerk_user_id,
        COALESCE(NULLIF(TRIM(email), ''), '') AS email,
        COALESCE(system_role, CASE WHEN lower(trim(COALESCE(role, ''))) IN ('owner', 'admin') THEN 'admin' ELSE 'user' END) AS role,
        COALESCE(system_role, CASE WHEN lower(trim(COALESCE(role, ''))) IN ('owner', 'admin') THEN 'admin' ELSE 'user' END) AS system_role,
        COALESCE(is_active, true) AS account_active,
        created_at
      FROM users
      ORDER BY COALESCE(is_active, true) DESC, LOWER(COALESCE(email, ''))
    `
    return NextResponse.json(result.rows)
  } catch (e) {
    console.error('Admin users GET:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

/**
 * App rows (`users`) are created when someone signs in with Clerk (or via webhook).
 * To pre-register staff for assignments, use POST /api/admin/staff-people instead.
 */
export async function POST() {
  const err = await requireAdmin()
  if (err) return err
  return NextResponse.json(
    {
      error:
        'Use POST /api/admin/staff-people to add a staff directory row (name, email, role). Clerk accounts are created on first sign-in.',
    },
    { status: 405 }
  )
}
