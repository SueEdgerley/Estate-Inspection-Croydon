import { auth, currentUser } from '@clerk/nextjs/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Session + app user role for client UI (e.g. nav). Does not enforce permissions.
 */
export async function GET() {
  const { userId } = await auth()
  const clerkUser = await currentUser()
  const clerkIsAdmin = clerkUser?.publicMetadata?.isAdmin === true

  if (!userId) {
    return Response.json({ userId: null, role: null, clerkIsAdmin: false })
  }

  let role = null
  try {
    if (getPgUrl()) {
      await ensureDatabase()
      const result = await sql`
        SELECT role FROM users WHERE clerk_user_id = ${userId} LIMIT 1
      `
      role = result.rows[0]?.role ?? null
    }
  } catch (e) {
    console.warn('[auth/me] role lookup failed:', e?.message)
  }

  return Response.json({ userId, role, clerkIsAdmin })
}
