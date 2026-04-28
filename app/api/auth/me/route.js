import { auth, currentUser } from '@clerk/nextjs/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '@/lib/db'
import { ensureClerkUserProvisioned } from '@/lib/ensure-clerk-user-provisioned'
import { getRoleUiFlags } from '@/lib/app-role-access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Session + app user role for client UI (nav). Server routes enforce permissions separately.
 */
export async function GET() {
  const { userId } = await auth()
  const clerkUser = await currentUser()
  const clerkIsAdmin = clerkUser?.publicMetadata?.isAdmin === true

  if (!userId) {
    return Response.json({
      userId: null,
      role: null,
      clerkIsAdmin: false,
      roleUi: null,
    })
  }

  let systemRole = null
  let jobTitle = null
  try {
    if (getPgUrl()) {
      await ensureDatabase()
      const email =
        clerkUser?.primaryEmailAddress?.emailAddress ??
        clerkUser?.emailAddresses?.[0]?.emailAddress ??
        null
      try {
        const displayName = [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(' ').trim() || null
        await ensureClerkUserProvisioned(userId, email, { displayName })
      } catch (provErr) {
        console.warn('[auth/me] user provision failed:', provErr?.message)
      }
      const result = await sql`
        SELECT
          CASE
            WHEN lower(trim(COALESCE(u.role, ''))) = 'owner' THEN 'owner'
            WHEN lower(trim(COALESCE(u.system_role, u.role, ''))) = 'admin' THEN 'admin'
            ELSE 'user'
          END AS system_role,
          p.job_title
        FROM users u
        LEFT JOIN people p ON p.id = u.people_id OR lower(trim(p.email)) = lower(trim(COALESCE(u.email, '')))
        WHERE u.clerk_user_id = ${userId}
        ORDER BY CASE WHEN p.id = u.people_id THEN 0 ELSE 1 END
        LIMIT 1
      `
      systemRole = result.rows[0]?.system_role ?? null
      jobTitle = result.rows[0]?.job_title ?? null
    }
  } catch (e) {
    console.warn('[auth/me] role lookup failed:', e?.message)
  }

  const roleUi = getRoleUiFlags(systemRole, clerkIsAdmin, jobTitle)

  return Response.json({
    userId,
    role: systemRole,
    systemRole,
    jobTitle,
    clerkIsAdmin,
    roleUi,
  })
}
