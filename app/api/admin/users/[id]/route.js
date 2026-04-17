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

    const coerceBool = (v) => (typeof v === 'boolean' ? v : null)
    const nextAccountActive =
      coerceBool(body.account_active) ?? coerceBool(body.active)

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

/**
 * Permanent removal of the `users` row (Neon/Postgres). No Clerk API call.
 * Inspections are unchanged (denormalized inspector fields).
 * Does not run SQL against other tables; optional FK CASCADE applies only if those tables exist in DB.
 * Cannot delete self or the last active owner.
 *
 * No JSON body required (DELETE bodies are often stripped by proxies); confirm in the UI instead.
 */
export async function DELETE(_request, { params }) {
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
    if (myInternalId && id === myInternalId) {
      return NextResponse.json({ error: 'You cannot delete your own account.' }, { status: 400 })
    }

    const u = (
      await sql`
        SELECT id, role, COALESCE(is_active, true) AS is_active
        FROM users WHERE id = ${id} LIMIT 1
      `
    ).rows[0]
    if (!u) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const isOwner = String(u.role || '').toLowerCase().trim() === 'owner' && u.is_active !== false
    if (isOwner) {
      const ownerCount = (
        await sql`
          SELECT COUNT(*)::int AS c FROM users
          WHERE lower(trim(role)) = 'owner' AND COALESCE(is_active, true) = true
        `
      ).rows[0]?.c ?? 0
      if (ownerCount <= 1) {
        return NextResponse.json(
          { error: 'Cannot delete the only active owner. Promote another owner first.' },
          { status: 400 }
        )
      }
    }

    await sql`DELETE FROM users WHERE id = ${id}`

    return NextResponse.json({
      ok: true,
      deletedId: id,
      deletedFromAppDatabase: true,
      clerkUserDeleted: false,
      tablesTouched: ['users'],
      message:
        'Removed this user from the app database (`users` row only). Past inspections still show stored inspector name/email. If your database defines related tables (e.g. assignments) with ON DELETE CASCADE, the database may remove those rows automatically.',
      clerkNotice:
        'The Clerk user account was not changed. They may still be able to sign in at Clerk until you delete or block that user in the Clerk Dashboard (or they remain unused).',
    })
  } catch (e) {
    console.error('Admin users DELETE:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
