import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '@/lib/db'
import { getRouteAccess } from '@/lib/permissions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function isMissingRelationError(error) {
  return error?.code === '42P01' || String(error?.message || '').toLowerCase().includes('does not exist')
}

export async function GET() {
  const { access, denialResponse } = await getRouteAccess({ requireInspections: true })
  if (denialResponse) return denialResponse

  try {
    await ensureDatabase()
    if (!getPgUrl()) {
      return NextResponse.json(
        { error: 'Database not configured. Please set up Postgres.' },
        { status: 503 }
      )
    }

    let estates = []
    let blocks = []
    let people = []

    try {
      const estatesResult = await sql`SELECT id, name FROM estates ORDER BY name`
      estates = estatesResult.rows
    } catch (error) {
      if (!isMissingRelationError(error)) throw error
      console.warn('[Ad hoc options] estates table not available')
    }

    try {
      const blocksResult = await sql`
        SELECT b.id, b.name, b.estate_id, e.name AS estate_name
        FROM blocks b
        LEFT JOIN estates e ON e.id = b.estate_id
        ORDER BY b.name
      `
      blocks = blocksResult.rows
    } catch (error) {
      if (!isMissingRelationError(error)) throw error
      try {
        const fallbackBlocks = await sql`SELECT id, name, estate_id FROM blocks ORDER BY name`
        blocks = fallbackBlocks.rows.map((b) => ({ ...b, estate_name: null }))
      } catch (fallbackError) {
        if (!isMissingRelationError(fallbackError)) throw fallbackError
        console.warn('[Ad hoc options] blocks table not available')
      }
    }

    try {
      const peopleResult = await sql`
        SELECT id, name, email, COALESCE(active, true) AS active
        FROM people
        WHERE COALESCE(active, true) = true
        ORDER BY name
      `
      people = peopleResult.rows
    } catch (error) {
      if (!isMissingRelationError(error)) throw error
      console.warn('[Ad hoc options] people table not available')
    }

    return NextResponse.json({
      estates,
      blocks,
      people,
      permissions: {
        canCreateAdHocInspection: Boolean(access?.permissions?.canCreateAdHocInspection),
      },
    })
  } catch (error) {
    console.error('[Ad hoc options] failed:', error)
    return NextResponse.json(
      { error: 'Failed to load ad hoc inspection options', details: error?.message || String(error) },
      { status: 500 }
    )
  }
}
