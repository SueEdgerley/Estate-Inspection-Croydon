import { auth, currentUser } from '@clerk/nextjs/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '@/lib/db'
import { ensureClerkUserProvisioned } from '@/lib/ensure-clerk-user-provisioned'

/**
 * Settings / Data Import admin: Clerk isAdmin, or any signed-in user who is NOT the
 * restricted app role `user` (owner, admin, null/empty role, etc.).
 * Deny only explicit Postgres users.role = user without Clerk admin (matches nav).
 * @returns { Promise<{ ok: boolean, userId: string|null, reason?: string }> }
 */
export async function getAppAdminAccess() {
  const { userId } = await auth()
  if (!userId) return { ok: false, userId: null, reason: 'unauthorized' }

  let cu = null
  try {
    cu = await currentUser()
  } catch {
    /* continue */
  }

  if (getPgUrl()) {
    try {
      await ensureDatabase()
      const email =
        cu?.primaryEmailAddress?.emailAddress ?? cu?.emailAddresses?.[0]?.emailAddress ?? null
      const displayName = [cu?.firstName, cu?.lastName].filter(Boolean).join(' ').trim() || null
      await ensureClerkUserProvisioned(userId, email, { displayName })
    } catch (e) {
      console.warn('[getAppAdminAccess] user provision failed:', e?.message)
    }
  }

  if (cu?.publicMetadata?.isAdmin === true) {
    return { ok: true, userId }
  }

  if (!getPgUrl()) {
    return { ok: false, userId, reason: 'no_database' }
  }

  try {
    const r = await sql`
      SELECT lower(trim(role)) AS r FROM users WHERE clerk_user_id = ${userId} LIMIT 1
    `
    if (!r.rows[0]) {
      return { ok: false, userId, reason: 'not_provisioned' }
    }
    const role = r.rows[0]?.r || ''
    if (role === 'user') {
      return { ok: false, userId, reason: 'forbidden' }
    }
    return { ok: true, userId }
  } catch {
    return { ok: false, userId, reason: 'role_lookup_failed' }
  }
}
