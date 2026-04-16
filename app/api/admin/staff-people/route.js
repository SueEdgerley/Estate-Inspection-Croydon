import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '@/lib/db'
import { getAppAdminAccess } from '@/lib/app-admin-access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * People rows usable for estate/block assignments (excludes issue_recipient mailboxes).
 * Separate from `/api/admin/users` (Clerk app accounts).
 */
export async function GET() {
  const access = await getAppAdminAccess()
  if (!access.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!access.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!getPgUrl()) return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  try {
    await ensureDatabase()
    const result = await sql`
      SELECT id, name, email, role, COALESCE(active, true) AS active
      FROM people
      WHERE category IS DISTINCT FROM 'issue_recipient'
      ORDER BY LOWER(name), LOWER(email)
    `
    return NextResponse.json(result.rows)
  } catch (e) {
    console.error('[admin/staff-people] GET:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
