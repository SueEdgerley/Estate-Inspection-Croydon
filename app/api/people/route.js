import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '../../../lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function normalizeRoutingCategories(rows) {
  const byPersonId = new Map()
  for (const row of rows || []) {
    if (!row?.person_id || !row?.issue_category) continue
    const key = String(row.person_id)
    const current = byPersonId.get(key) || []
    const category = String(row.issue_category).trim()
    if (category && !current.includes(category)) current.push(category)
    byPersonId.set(key, current)
  }
  return byPersonId
}

// GET - active people for inspection recipient dropdowns (Neon)
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
      SELECT id, name, email, category, role, job_title
      FROM people
      WHERE COALESCE(active, true) = true
      ORDER BY
        CASE WHEN category = 'issue_recipient' THEN 0 ELSE 1 END,
        name ASC,
        email ASC
    `
    let routingCategoriesByPersonId = new Map()
    try {
      const routingResult = await sql`
        SELECT DISTINCT p.id AS person_id, r.issue_category
        FROM issue_routing_rules r
        JOIN people p ON (
          (r.assign_to_person_id IS NOT NULL AND p.id = r.assign_to_person_id)
          OR (r.assign_to_role IS NOT NULL AND (p.job_title = r.assign_to_role OR p.role = r.assign_to_role))
        )
        WHERE r.active = true
          AND COALESCE(p.active, true) = true
      `
      routingCategoriesByPersonId = normalizeRoutingCategories(routingResult.rows)
    } catch (routingError) {
      if (
        routingError?.code !== '42P01' &&
        !/relation\s+"?issue_routing_rules"?\s+does not exist/i.test(String(routingError?.message || routingError))
      ) {
        throw routingError
      }
      console.warn('[GET /api/people] issue_routing_rules table missing; returning people without routing categories')
    }
    console.log('[GET /api/people] active rows:', result.rows.length)
    return NextResponse.json(
      result.rows.map((row) => ({
        ...row,
        issue_categories: routingCategoriesByPersonId.get(String(row.id)) || [],
      }))
    )
  } catch (error) {
    console.error('Error fetching people list:', error)
    return NextResponse.json(
      { error: 'Failed to fetch people', details: error.message },
      { status: 500 }
    )
  }
}
