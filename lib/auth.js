import { auth, currentUser } from '@clerk/nextjs/server'

/**
 * Get current Clerk auth (use in Server Components / API routes).
 * @returns { Promise<{ userId: string | null, sessionId: string | null }> }
 */
export async function getAuth() {
  return auth()
}

/**
 * Current user's primary email (for linking inspections).
 * @returns { Promise<string | null> }
 */
export async function getCurrentUserEmail() {
  const user = await currentUser()
  const email = user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses?.[0]?.emailAddress
  return email ?? null
}

/**
 * Current user's display name (firstName + lastName or email).
 * @returns { Promise<string | null> }
 */
export async function getCurrentUserName() {
  const user = await currentUser()
  if (!user) return null
  const first = user.firstName ?? ''
  const last = user.lastName ?? ''
  const name = [first, last].filter(Boolean).join(' ').trim()
  if (name) return name
  const email = user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses?.[0]?.emailAddress
  return email || user.id
}

/**
 * Whether the current user has isAdmin in Clerk public metadata.
 * Set in Clerk Dashboard: User → Public metadata → { "isAdmin": true }
 * @returns { Promise<boolean> }
 */
export async function isAdmin() {
  const user = await currentUser()
  return user?.publicMetadata?.isAdmin === true
}
