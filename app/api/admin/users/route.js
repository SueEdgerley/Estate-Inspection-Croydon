import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '@/lib/db'
import { getAppAdminAccess } from '@/lib/app-admin-access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const APP_ROLES = ['owner', 'admin', 'user']

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
 * - `display_name` = email (there is no separate name column on users)
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
        COALESCE(role, 'user') AS role,
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

/** Manual row creation requires a Clerk user id; use sign-in to provision accounts. */
export async function POST() {
  const err = await requireAdmin()
  if (err) return err
  return NextResponse.json(
    {
      error:
        'Adding users from Settings is not supported. Accounts are created when someone signs in with Clerk; manage role and access here.',
    },
    { status: 405 }
  )
}
