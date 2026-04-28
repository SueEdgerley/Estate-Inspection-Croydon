import { auth, currentUser } from '@clerk/nextjs/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '@/lib/db'
import { ensureClerkUserProvisioned } from '@/lib/ensure-clerk-user-provisioned'
import { canUseSettingsAdminUi, normalizeAppRole } from '@/lib/app-role-access'

/**
 * Settings / Data Import / Manage Users: Clerk isAdmin, or Postgres role `admin` / legacy `owner` only.
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

  const clerkIsAdmin = cu?.publicMetadata?.isAdmin === true
  if (clerkIsAdmin) {
    return { ok: true, userId }
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

  if (!getPgUrl()) {
    return { ok: false, userId, reason: 'no_database' }
  }

  try {
    const r = await sql`
      SELECT COALESCE(system_role, CASE WHEN lower(trim(COALESCE(role, ''))) IN ('owner', 'admin') THEN 'admin' ELSE 'user' END) AS system_role
      FROM users
      WHERE clerk_user_id = ${userId}
      LIMIT 1
    `
    if (!r.rows[0]) {
      return { ok: false, userId, reason: 'not_provisioned' }
    }
    const raw = r.rows[0]?.system_role ?? ''
    const normalized = normalizeAppRole(raw)
    if (!canUseSettingsAdminUi(normalized, false)) {
      return { ok: false, userId, reason: 'forbidden' }
    }
    return { ok: true, userId }
  } catch {
    return { ok: false, userId, reason: 'role_lookup_failed' }
  }
}
