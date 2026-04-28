import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '@/lib/db'
import { getAppAdminAccess } from '@/lib/app-admin-access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Clerk-linked accounts (`users` table only; same data as GET /api/admin/users). */
export async function GET() {
  const access = await getAppAdminAccess()
  if (!access.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!access.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!getPgUrl()) return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  try {
    await ensureDatabase()
    const result = await sql`
      SELECT
        id,
        clerk_user_id,
        COALESCE(NULLIF(TRIM(email), ''), '') AS email,
        COALESCE(system_role, CASE WHEN lower(trim(COALESCE(role, ''))) IN ('owner', 'admin') THEN 'admin' ELSE 'user' END) AS system_role,
        COALESCE(system_role, CASE WHEN lower(trim(COALESCE(role, ''))) IN ('owner', 'admin') THEN 'admin' ELSE 'user' END) AS role,
        COALESCE(is_active, true) AS is_active,
        created_at,
        updated_at
      FROM users
      ORDER BY created_at DESC
    `
    return NextResponse.json(result.rows)
  } catch (e) {
    console.error('[admin/app-users] GET:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
