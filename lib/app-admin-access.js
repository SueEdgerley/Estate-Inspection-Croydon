import { auth, currentUser } from '@clerk/nextjs/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '@/lib/db'

/**
 * App admin: Clerk publicMetadata.isAdmin OR Postgres users.role owner|admin.
 * Aligns with /api/inspections list rules (not Clerk-only).
 * @returns { Promise<{ ok: boolean, userId: string|null, reason?: string }> }
 */
export async function getAppAdminAccess() {
  const { userId } = await auth()
  if (!userId) return { ok: false, userId: null, reason: 'unauthorized' }

  try {
    const cu = await currentUser()
    if (cu?.publicMetadata?.isAdmin === true) {
      return { ok: true, userId }
    }
  } catch {
    /* continue to Postgres */
  }

  if (!getPgUrl()) {
    return { ok: false, userId, reason: 'no_database' }
  }

  try {
    await ensureDatabase()
    const r = await sql`
      SELECT lower(trim(role)) AS r FROM users WHERE clerk_user_id = ${userId} LIMIT 1
    `
    const role = r.rows[0]?.r || ''
    if (role === 'owner' || role === 'admin') {
      return { ok: true, userId }
    }
  } catch {
    return { ok: false, userId, reason: 'role_lookup_failed' }
  }

  return { ok: false, userId, reason: 'forbidden' }
}
