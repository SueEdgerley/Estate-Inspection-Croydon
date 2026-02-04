import { NextResponse } from 'next/server'
import { getPeople, normalizePerson } from '@/lib/airtable-client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET - Fetch people from Airtable (for recipient selection)
export async function GET() {
  try {
    const people = await getPeople()
    const normalized = people.map(normalizePerson)
    
    return NextResponse.json(normalized)
  } catch (error) {
    console.error('Error fetching people:', error)
    return NextResponse.json(
      { error: 'Failed to fetch people', details: error.message },
      { status: 500 }
    )
  }
}
