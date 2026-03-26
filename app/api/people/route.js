import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '../../../lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET - active recipient list from Postgres people table
export async function GET() {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await ensureDatabase()
    const pgUrl = getPgUrl()
    if (!pgUrl) {
      return NextResponse.json(
        { error: 'Database not configured. Please set up Postgres.' },
        { status: 503 }
      )
    }

    const result = await sql`
      SELECT id, name, email
      FROM people
      WHERE active = true
      ORDER BY name ASC, email ASC
    `
    return NextResponse.json(result.rows)
  } catch (error) {
    console.error('Error fetching people list:', error)
    return NextResponse.json(
      { error: 'Failed to fetch people', details: error.message },
      { status: 500 }
    )
  }
}
