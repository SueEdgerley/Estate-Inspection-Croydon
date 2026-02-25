import { auth, clerkClient } from '@clerk/nextjs/server'
import { getAirtableUserByClerkId, createAirtableRecord, TABLES } from '@/lib/airtable-client'

/**
 * Get the current user's Airtable Users record id, creating the record if it doesn't exist.
 * Uses Clerk session userId, looks up Airtable Users by "Clerk User ID", or creates from Clerk profile.
 * @returns { Promise<string> } Airtable Users record id (for linking on Inspection)
 * @throws { Error } If not signed in or Airtable/Clerk fails
 */
export async function getOrCreateAirtableUser() {
  const { userId } = await auth()
  if (!userId) throw new Error('Not signed in')

  const found = await getAirtableUserByClerkId(userId)
  if (found) return found.id

  const client = typeof clerkClient === 'function' ? await clerkClient() : clerkClient
  const user = await client.users.getUser(userId)
  const primaryEmail = user.emailAddresses?.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress
  const fallbackEmail = user.emailAddresses?.[0]?.emailAddress
  const email = (primaryEmail ?? fallbackEmail) ?? ''
  const hasName = Boolean(user.firstName || user.lastName)
  const name = hasName
    ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim()
    : (user.username != null && user.username !== '' ? user.username : (email !== '' ? email : 'Unknown user'))

  const createdId = await createAirtableRecord(TABLES.USERS, {
    Name: name,
    Email: email,
    'Clerk User ID': userId,
    Active: true,
  })
  return createdId
}
