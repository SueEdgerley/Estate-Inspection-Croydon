/**
 * Ensure a signed-in Clerk user has a row in Postgres `users` (Neon).
 * Called from /api/auth/me, getAppAdminAccess, and dashboard — idempotent upsert.
 */
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '@/lib/db'

/** New sign-ups get this app role until an admin promotes them (owner/admin) in the DB. */
export const DEFAULT_APP_ROLE_FOR_NEW_USERS = 'user'

/**
 * @param {string} clerkUserId - Clerk `userId` (sub)
 * @param {string|null|undefined} email - Primary email when known
 */
export async function ensureClerkUserProvisioned(clerkUserId, email = null) {
  if (!clerkUserId || !getPgUrl()) return
  await ensureDatabase()
  const normalized =
    typeof email === 'string' && email.trim() ? email.trim().toLowerCase() : null
  const id = crypto.randomUUID()
  await sql`
    INSERT INTO users (id, clerk_user_id, email, role, is_active)
    VALUES (${id}, ${clerkUserId}, ${normalized}, ${DEFAULT_APP_ROLE_FOR_NEW_USERS}, true)
    ON CONFLICT (clerk_user_id) DO UPDATE SET
      email = COALESCE(EXCLUDED.email, users.email),
      updated_at = CURRENT_TIMESTAMP
  `
}
