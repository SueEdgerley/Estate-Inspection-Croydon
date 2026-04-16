import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '@/lib/db'
import { getAppAdminAccess } from '@/lib/app-admin-access'
import { syncClerkAccountToStaffDirectory } from '@/lib/sync-clerk-user-to-people'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Create/link `people` staff row for this `users` row (same email). */
export async function POST(request, { params }) {
  const access = await getAppAdminAccess()
  if (!access.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!access.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!getPgUrl()) return NextResponse.json({ error: 'Database not configured' }, { status: 503 })

  const id = params?.id
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  try {
    await ensureDatabase()
    const cur = await sql`
      SELECT clerk_user_id, email FROM users WHERE id = ${id} LIMIT 1
    `
    const row = cur.rows[0]
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const email = row.email && String(row.email).trim()
    if (!email) {
      return NextResponse.json({ error: 'This account has no email yet; sync after Clerk has an email.' }, { status: 400 })
    }

    const result = await syncClerkAccountToStaffDirectory({
      clerkUserId: row.clerk_user_id,
      email,
      displayName: null,
    })

    const out = await sql`
      SELECT u.id, u.clerk_user_id, u.email, u.role, COALESCE(u.is_active, true) AS is_active,
        u.people_id, pe.name AS staff_directory_name
      FROM users u
      LEFT JOIN people pe ON pe.id = u.people_id
      WHERE u.id = ${id}
      LIMIT 1
    `
    return NextResponse.json({ sync: result, user: out.rows[0] || null })
  } catch (e) {
    console.error('[admin/app-users/sync-staff]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
