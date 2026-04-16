/**
 * Ensure a signed-in Clerk user has a row in Postgres `users` (Neon).
 * Called from /api/auth/me, getAppAdminAccess, dashboard, and POST /api/webhooks/clerk — idempotent upsert.
 *
 * Uses @neondatabase/serverless `neon()` with the same connection string as lib/db.js so writes work
 * even when @vercel/postgres sql is misconfigured for Neon-only env vars.
 */
import { neon } from '@neondatabase/serverless'
import { ensureDatabase, getConnectionString } from '@/lib/db'
import { syncClerkAccountToStaffDirectory } from '@/lib/sync-clerk-user-to-people'

/** New sign-ups get this app role until an admin promotes them (owner/admin) in the DB. */
export const DEFAULT_APP_ROLE_FOR_NEW_USERS = 'user'

/**
 * @param {string} clerkUserId - Clerk `userId` (sub)
 * @param {string|null|undefined} email - Primary email when known
 */
export async function ensureClerkUserProvisioned(clerkUserId, email = null) {
  const cs = getConnectionString()
  if (!clerkUserId) return
  if (!cs) {
    console.warn(
      '[ensureClerkUserProvisioned] skipped: no database URL (set DATABASE_URL, POSTGRES_URL, NEON_DATABASE_URL, etc.)'
    )
    return
  }

  await ensureDatabase()
  const normalized =
    typeof email === 'string' && email.trim() ? email.trim().toLowerCase() : null
  const id = crypto.randomUUID()

  const run = neon(cs)
  try {
    await run`
      INSERT INTO users (id, clerk_user_id, email, role, is_active)
      VALUES (${id}, ${clerkUserId}, ${normalized}, ${DEFAULT_APP_ROLE_FOR_NEW_USERS}, true)
      ON CONFLICT (clerk_user_id) DO UPDATE SET
        email = COALESCE(EXCLUDED.email, users.email),
        updated_at = CURRENT_TIMESTAMP
    `
  } catch (err) {
    console.error('[ensureClerkUserProvisioned] upsert failed:', clerkUserId, err?.message || err)
    throw err
  }

  if (normalized) {
    try {
      await syncClerkAccountToStaffDirectory({
        clerkUserId,
        email: normalized,
        displayName: options.displayName ?? null,
      })
    } catch (syncErr) {
      console.warn('[ensureClerkUserProvisioned] staff directory sync:', syncErr?.message || syncErr)
    }
  }
}
