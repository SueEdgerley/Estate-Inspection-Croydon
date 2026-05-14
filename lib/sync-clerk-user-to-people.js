/**
 * Link a Clerk-backed `users` row to a `people` staff-directory row (same email).
 * Creates `people` with category `staff` when missing; never overwrites `issue_recipient`.
 */
import { neon } from '@neondatabase/serverless'
import { ensureDatabase, getConnectionString } from '@/lib/db'

/**
 * @param {{ clerkUserId: string, email: string, displayName?: string|null }} opts
 * @returns {Promise<{ personId: string|null, created: boolean, skipped?: string }|null>}
 */
export async function syncClerkAccountToStaffDirectory({ clerkUserId, email, displayName }) {
  if (!clerkUserId || !email || typeof email !== 'string' || !email.trim()) return null
  const cs = getConnectionString()
  if (!cs) return null

  await ensureDatabase()
  const em = email.trim().toLowerCase()
  const nameFromEmail = em.split('@')[0] || 'User'
  const name =
    (typeof displayName === 'string' && displayName.trim()) ? displayName.trim() : nameFromEmail

  const run = neon(cs)

  const existing = await run`
    SELECT id, category, name, COALESCE(active, true) AS active
    FROM people
    WHERE lower(trim(email)) = ${em}
    LIMIT 1
  `
  const row = existing[0]
  if (row?.category === 'issue_recipient') {
    return { personId: null, created: false, skipped: 'email_reserved_for_issue_recipient' }
  }

  let personId = row?.id
  let created = false
  if (!personId) {
    personId = `person_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`
    await run`
      INSERT INTO people (id, name, email, role, category, active)
      VALUES (${personId}, ${name}, ${em}, null, 'staff', true)
    `
    created = true
  } else {
    await run`
      UPDATE people
      SET
        name = CASE
          WHEN ${displayName && String(displayName).trim() ? true : false} THEN ${name}
          ELSE name
        END,
        category = CASE WHEN category = 'issue_recipient' THEN category ELSE 'staff' END,
        active = true,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${personId}
    `
  }

  await run`
    UPDATE users
    SET people_id = ${personId}, updated_at = CURRENT_TIMESTAMP
    WHERE clerk_user_id = ${clerkUserId}
      AND (people_id IS NULL OR people_id = ${personId})
  `

  return { personId, created }
}
