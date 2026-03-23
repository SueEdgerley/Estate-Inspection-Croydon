import { auth, clerkClient } from '@clerk/nextjs/server'
import { getAirtableUserByClerkId, createAirtableRecord, TABLES } from '@/lib/airtable-client'

/**
 * Get the current user's Airtable Users record id, creating the record if it doesn't exist.
 * 1) Find by Clerk User ID in Airtable Users table.
 * 2) If missing, fetch from Clerk and create (Name, Email, Clerk User ID, Active).
 * @returns { Promise<string> } Airtable Users record id (for linking on Inspection: User: [id])
 * @throws { Error } If not signed in or Airtable/Clerk fails
 */
export async function getOrCreateAirtableUser() {
  const { userId } = await auth()
  if (!userId) throw new Error('Unauthorised: no Clerk userId')

  const existing = await getAirtableUserByClerkId(userId)
  if (existing) return existing.id

  const client = typeof clerkClient === 'function' ? await clerkClient() : clerkClient
  const clerkUser = await client.users.getUser(userId)
  const email = clerkUser.emailAddresses?.[0]?.emailAddress ?? ''
  const namePart = `${clerkUser.firstName ?? ''} ${clerkUser.lastName ?? ''}`.trim()
  const name = namePart || clerkUser.username || email || 'Unknown user'

  const createdId = await createAirtableRecord(TABLES.USERS, {
    Name: name,
    Email: email,
    'Clerk User ID': userId,
    Active: true,
  })
  return createdId
}
