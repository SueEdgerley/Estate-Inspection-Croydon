import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '@/lib/db'
import { getAppAdminAccess } from '@/lib/app-admin-access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Clerk-linked accounts (`users` table) for Settings. */
export async function GET() {
  const access = await getAppAdminAccess()
  if (!access.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!access.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!getPgUrl()) return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  try {
    await ensureDatabase()
    const result = await sql`
      SELECT
        u.id,
        u.clerk_user_id,
        u.email,
        u.role,
        COALESCE(u.is_active, true) AS is_active,
        u.created_at,
        u.updated_at,
        u.people_id,
        pe.name AS staff_directory_name
      FROM users u
      LEFT JOIN people pe ON pe.id = u.people_id
      ORDER BY u.created_at DESC
    `
    return NextResponse.json(result.rows)
  } catch (e) {
    console.error('[admin/app-users] GET:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
