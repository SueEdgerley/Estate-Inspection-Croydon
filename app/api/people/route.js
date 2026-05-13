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

const ISSUE_RECIPIENT_TYPES = new Set(['issue_recipient', 'issue recipient', 'routing_mailbox', 'routing mailbox'])

function isIssueRecipient(row) {
  return ISSUE_RECIPIENT_TYPES.has(String(row?.category || '').trim().toLowerCase()) ||
    ISSUE_RECIPIENT_TYPES.has(String(row?.role || '').trim().toLowerCase())
}

function normalizeEmail(value) {
  const email = String(value || '').trim()
  return /^[^\s@()<>]+@[^\s@()<>]+\.[^\s@()<>]+$/.test(email) ? email : ''
}

function normalizeCategoryToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function isPestControlIssueRecipient(row) {
  if (row?.issue_recipient !== true) return false
  const categories = Array.isArray(row?.issue_categories) ? row.issue_categories : []
  return [
    ...categories,
    row?.category,
    row?.role,
    row?.job_title,
  ].some((value) => normalizeCategoryToken(value) === 'pest_control')
}

function buildPestControlEnvRecipient(existingRows) {
  if ((existingRows || []).some(isPestControlIssueRecipient)) return null
  const email = normalizeEmail(process.env.PEST_CONTROL_EMAIL)
  if (!email) return null
  return {
    id: email,
    name: 'Pest Control',
    email,
    category: 'issue_recipient',
    role: 'routing_mailbox',
    job_title: null,
    issue_categories: ['pest_control'],
    issue_recipient: true,
    recipient_source: 'env',
  }
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
    const rows = result.rows.map((row) => {
      const issueCategories = routingCategoriesByPersonId.get(String(row.id)) || []
      return {
        ...row,
        issue_categories: issueCategories,
        issue_recipient: isIssueRecipient(row),
        recipient_source: 'people',
      }
    })
    const pestControlFallback = buildPestControlEnvRecipient(rows)
    return NextResponse.json(pestControlFallback ? [...rows, pestControlFallback] : rows)
  } catch (error) {
    console.error('Error fetching people list:', error)
    return NextResponse.json(
      { error: 'Failed to fetch people', details: error.message },
      { status: 500 }
    )
  }
}
