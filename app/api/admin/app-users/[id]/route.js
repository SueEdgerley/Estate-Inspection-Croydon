import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '@/lib/db'
import { getAppAdminAccess } from '@/lib/app-admin-access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const APP_ROLES = new Set(['admin', 'user'])

export async function PATCH(request, { params }) {
  const access = await getAppAdminAccess()
  if (!access.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!access.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!getPgUrl()) return NextResponse.json({ error: 'Database not configured' }, { status: 503 })

  const id = params?.id
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const body = await request.json().catch(() => ({}))
  const touched = body.role !== undefined || body.system_role !== undefined || typeof body.is_active === 'boolean'
  if (!touched) {
    return NextResponse.json({ error: 'Provide system role and/or is_active' }, { status: 400 })
  }

  try {
    await ensureDatabase()
    const cur = await sql`
      SELECT
        id,
        COALESCE(system_role, CASE WHEN lower(trim(COALESCE(role, ''))) IN ('owner', 'admin') THEN 'admin' ELSE 'user' END) AS system_role,
        COALESCE(is_active, true) AS is_active
      FROM users
      WHERE id = ${id}
      LIMIT 1
    `
    const row0 = cur.rows[0]
    if (!row0) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    let role = row0.system_role
    let isActive = row0.is_active

    if (body.role !== undefined || body.system_role !== undefined) {
      const r = String(body.system_role ?? body.role).toLowerCase().trim()
      if (!APP_ROLES.has(r)) {
        return NextResponse.json({ error: 'system role must be admin or user' }, { status: 400 })
      }
      role = r
    }
    if (typeof body.is_active === 'boolean') {
      isActive = body.is_active
    }

    await sql`
      UPDATE users
      SET system_role = ${role}, role = ${role}, is_active = ${isActive}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
    `

    const row = (
      await sql`
        SELECT id, clerk_user_id, email, system_role, system_role AS role, COALESCE(is_active, true) AS is_active,
          created_at, updated_at, people_id
        FROM users WHERE id = ${id}
      `
    ).rows[0]
    return NextResponse.json(row)
  } catch (e) {
    console.error('[admin/app-users] PATCH:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
