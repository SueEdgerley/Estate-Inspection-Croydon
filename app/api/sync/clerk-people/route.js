import { NextResponse } from 'next/server'
import { clerkClient } from '@clerk/nextjs/server'
import { getPeople, createAirtableRecord, TABLES } from '@/lib/airtable-client'
import { getRouteAccess } from '@/lib/permissions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/sync/clerk-people
 * One-way sync: create Airtable People records for Clerk users that don't exist yet.
 * Requires admin. No Airtable schema changes; uses Name, Email, Active.
 */
export async function POST() {
  try {
    const { denialResponse } = await getRouteAccess({ requireAdmin: true })
    if (denialResponse) return denialResponse

    const hasKey = process.env.AIRTABLE_API_TOKEN || process.env.AIRTABLE_API_KEY || process.env.AIRTABLE_TOKEN
    if (!process.env.AIRTABLE_BASE_ID?.trim() || !hasKey?.trim()) {
      return NextResponse.json(
        { error: 'Airtable not configured' },
        { status: 503 }
      )
    }

    // Clerk v6: clerkClient is async; v5: clerkClient is the client object
    const client = typeof clerkClient === 'function' ? await clerkClient() : clerkClient
    const users = await client.users.getUserList({ limit: 500 })
    const existingPeople = await getPeople()
    const emailToPerson = new Map()
    existingPeople.forEach((p) => {
      const email = (p['Email'] ?? p.email ?? '').toString().trim().toLowerCase()
      if (email) emailToPerson.set(email, p)
    })

    let created = 0
    for (const user of users.data) {
      const primaryEmail = user.emailAddresses?.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress ?? user.emailAddresses?.[0]?.emailAddress
      if (!primaryEmail) continue
      const email = primaryEmail.trim().toLowerCase()
      if (emailToPerson.has(email)) continue

      const firstName = user.firstName ?? ''
      const lastName = user.lastName ?? ''
      const name = [firstName, lastName].filter(Boolean).join(' ').trim() || primaryEmail

      const fields = {
        Name: name,
        Email: primaryEmail,
        Active: true,
      }
      try {
        await createAirtableRecord(TABLES.PEOPLE, fields)
        created++
        emailToPerson.set(email, { Email: primaryEmail })
      } catch (err) {
        console.warn('[sync clerk-people] Failed to create person for', primaryEmail, err.message)
      }
    }

    return NextResponse.json({ synced: true, created, totalClerkUsers: users.data.length })
  } catch (error) {
    console.error('Error syncing Clerk → Airtable People:', error)
    return NextResponse.json(
      { error: 'Sync failed', details: error.message },
      { status: 500 }
    )
  }
}
