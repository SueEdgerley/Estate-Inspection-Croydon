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
  let provisioningError = null
  try {
    if (getPgUrl()) {
      await ensureDatabase()
      const email =
        clerkUser?.primaryEmailAddress?.emailAddress ??
        clerkUser?.emailAddresses?.[0]?.emailAddress ??
        null
      if (!clerkUser) {
        console.warn('[auth/me] Clerk session has userId but currentUser() returned null:', { userId })
      }
      try {
        const displayName = [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(' ').trim() || null
        await ensureClerkUserProvisioned(userId, email, { displayName })
      } catch (provErr) {
        provisioningError = provErr?.message || String(provErr)
        console.error('[auth/me] user provision failed:', {
          userId,
          email,
          error: provisioningError,
        })
      }
      const result = await sql`
        SELECT
          CASE
            WHEN lower(trim(COALESCE(u.role, ''))) = 'owner' THEN 'owner'
            WHEN lower(trim(COALESCE(u.system_role, u.role, ''))) = 'admin' THEN 'admin'
            ELSE 'user'
          END AS system_role,
          COALESCE(
            p.job_title,
            CASE
              WHEN lower(trim(COALESCE(u.role, u.system_role, ''))) IN ('caretaker', 'caretakers') THEN 'Caretaker'
              WHEN lower(trim(COALESCE(u.role, u.system_role, ''))) IN ('housing officer', 'housing_officer', 'housing officers', 'housing_officers') THEN 'Housing Officer'
              WHEN lower(trim(COALESCE(u.role, u.system_role, ''))) IN ('estate services manager', 'estate_services_manager', 'estate service manager', 'estate_service_manager', 'esm') THEN 'ESM'
              ELSE NULL
            END
          ) AS job_title
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
    email:
      clerkUser?.primaryEmailAddress?.emailAddress ??
      clerkUser?.emailAddresses?.[0]?.emailAddress ??
      null,
    role: systemRole,
    systemRole,
    jobTitle,
    clerkIsAdmin,
    provisioningError,
    roleUi,
  })
}
