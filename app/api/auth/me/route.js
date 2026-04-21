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

  let role = null
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
        SELECT role FROM users WHERE clerk_user_id = ${userId} LIMIT 1
      `
      role = result.rows[0]?.role ?? null
    }
  } catch (e) {
    console.warn('[auth/me] role lookup failed:', e?.message)
  }

  const roleUi = getRoleUiFlags(role, clerkIsAdmin)

  return Response.json({
    userId,
    role,
    clerkIsAdmin,
    roleUi,
  })
}
