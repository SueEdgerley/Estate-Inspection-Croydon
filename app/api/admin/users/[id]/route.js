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

async function selectUserRow(userId) {
  const r = await sql`
    SELECT
      id,
      clerk_user_id,
      COALESCE(NULLIF(TRIM(email), ''), '') AS email,
      COALESCE(role, 'user') AS role,
      COALESCE(is_active, true) AS account_active,
      created_at
    FROM users
    WHERE id = ${userId}
    LIMIT 1
  `
  return r.rows[0] || null
}

export async function PATCH(request, { params }) {
  const err = await requireAdmin()
  if (err) return err
  const id = params?.id
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  try {
    await ensureDatabase()
    const body = await request.json().catch(() => ({}))

    const existing = await selectUserRow(id)
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const nextAccountActive =
      typeof body.account_active === 'boolean'
        ? body.account_active
        : typeof body.active === 'boolean'
          ? body.active
          : null

    const emailTouched = body.email !== undefined
    const roleTouched = body.role !== undefined

    if (nextAccountActive === null && !emailTouched && !roleTouched) {
      return NextResponse.json(
        { error: 'Provide account_active (or active), and/or email, role' },
        { status: 400 }
      )
    }

    let email = existing.email || ''
    let role = existing.role || 'user'
    let isActive = existing.account_active !== false

    if (nextAccountActive !== null) {
      isActive = nextAccountActive
    }
    if (emailTouched) {
      const em = String(body.email).trim().toLowerCase()
      if (!em) return NextResponse.json({ error: 'email cannot be empty' }, { status: 400 })
      email = em
    }
    if (roleTouched) {
      const r = String(body.role || '').toLowerCase().trim()
      if (!APP_ROLES.includes(r)) {
        return NextResponse.json({ error: `role must be one of: ${APP_ROLES.join(', ')}` }, { status: 400 })
      }
      role = r
    }

    await sql`
      UPDATE users
      SET
        email = ${email},
        role = ${role},
        is_active = ${isActive},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
    `

    const merged = await selectUserRow(id)
    return NextResponse.json(merged)
  } catch (e) {
    console.error('Admin users PATCH:', e)
    if (e?.code === '23505') {
      return NextResponse.json({ error: 'Email already in use' }, { status: 409 })
    }
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
