import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '../../../lib/db'
import { isIssueRecipientCategory } from '@/lib/validate-issue-recipient'
import { isIssueRecipientPeopleRequest } from '@/lib/issue-recipient-people'

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

function normalizeCategoryToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function rowMatchesIssueCategory(row, issueCategory) {
  if (!issueCategory) return true
  const token = normalizeCategoryToken(issueCategory)
  const categories = Array.isArray(row?.issue_categories) ? row.issue_categories : []
  return [
    ...categories,
    row?.category,
    row?.role,
    row?.job_title,
  ].some((value) => normalizeCategoryToken(value) === token)
}

function isIssueRecipient(row) {
  return isIssueRecipientCategory(row)
}

// GET - people for dropdowns; filter to issue recipients only when requested via query params
export async function GET(request) {
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

    const { searchParams } = new URL(request.url)
    const issueRecipientOnly = isIssueRecipientPeopleRequest(searchParams)
    const scope = String(searchParams.get('scope') || (issueRecipientOnly ? 'issue_recipients' : 'all'))
      .trim()
      .toLowerCase()
    const issueCategory = String(searchParams.get('issue_category') || '').trim()

    const result =
      scope === 'all' && !issueRecipientOnly
        ? await sql`
            SELECT id, name, email, category, role, job_title, active
            FROM people
            WHERE COALESCE(active, true) = true
            ORDER BY
              CASE WHEN lower(trim(COALESCE(category, ''))) IN ('issue_recipient', 'issue recipient') THEN 0 ELSE 1 END,
              name ASC,
              email ASC
          `
        : await sql`
            SELECT id, name, email, category, role, job_title, active
            FROM people
            WHERE COALESCE(active, true) = true
              AND lower(trim(COALESCE(category, ''))) IN ('issue_recipient', 'issue recipient')
            ORDER BY name ASC, email ASC
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

    let rows = result.rows.map((row) => {
      const issueCategories = routingCategoriesByPersonId.get(String(row.id)) || []
      return {
        ...row,
        issue_categories: issueCategories,
        issue_recipient: isIssueRecipient(row),
        recipient_source: 'people',
      }
    })

    if (issueRecipientOnly || scope !== 'all') {
      rows = rows.filter((row) => {
        const category = String(row.category || '')
          .trim()
          .toLowerCase()
          .replace(/\s+/g, '_')
        return category === 'issue_recipient' && row.active !== false
      })
    }
    if (issueCategory) {
      rows = rows.filter((row) => rowMatchesIssueCategory(row, issueCategory))
    }

    console.log('[GET /api/people] active rows:', rows.length, {
      scope,
      issueRecipientOnly,
      issueCategory: issueCategory || null,
    })
    return NextResponse.json(rows)
  } catch (error) {
    console.error('Error fetching people list:', error)
    return NextResponse.json(
      { error: 'Failed to fetch people', details: error.message },
      { status: 500 }
    )
  }
}
