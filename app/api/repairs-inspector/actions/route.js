import { NextResponse } from 'next/server'
import { auth, currentUser } from '@clerk/nextjs/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '@/lib/db'
import { ensureRepairActionFields } from '@/lib/repair-action-fields'
import { getAppRoleContextForClerkUser, isPrivilegedAdmin } from '@/lib/app-role-access'
import { isRepairsContactAccess } from '@/lib/repairs-contact-rules'
import {
  listRepairsMailboxActions,
  repairsMailboxError,
  resolveRepairsMailbox,
} from '@/lib/repairs-contact-access'
import { loadScopedOperationalIdentity, operationalActionVisibilitySql } from '@/lib/own-record-scope'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const cu = await currentUser()
    const roleCtx = await getAppRoleContextForClerkUser(userId, cu?.publicMetadata?.isAdmin === true, {
      ...cu?.publicMetadata,
      ...cu?.privateMetadata,
      ...cu?.unsafeMetadata,
    })
    if (isRepairsContactAccess(roleCtx)) {
      const resolved = await resolveRepairsMailbox()
      const mailboxError = repairsMailboxError(resolved)
      if (mailboxError) return mailboxError
      const actions = await listRepairsMailboxActions(resolved.mailbox.id)
      return NextResponse.json(actions)
    }

    if (!isPrivilegedAdmin(roleCtx.systemRole, roleCtx.clerkIsAdmin)) {
      if (!getPgUrl()) return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
      await ensureDatabase()
      await ensureRepairActionFields(sql)
      const email = cu?.primaryEmailAddress?.emailAddress || cu?.emailAddresses?.[0]?.emailAddress || ''
      const identity = await loadScopedOperationalIdentity(userId, email)
      const visibility = operationalActionVisibilitySql(identity)
      if (visibility.sql === 'FALSE') return NextResponse.json([])
      const rows = await selectScopedRepairInspectorActions(visibility)
      return NextResponse.json(rows)
    }

    if (!getPgUrl()) return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
    await ensureDatabase()
    await ensureRepairActionFields(sql)

    try {
      const result = await sql`
        SELECT
          a.id, a.inspection_id, a.section_id, a.section_name, a.question_id,
          a.category, a.priority, a.title, a.description, a.location, a.status, a.comment,
          a.photo_urls, a.issue_pdf_url, a.job_number, a.expected_completion_date,
          a.repair_notes, a.repair_photo_url, a.repair_updated_at,
          a.created_at, a.updated_at,
          i.title AS inspection_title,
          i.submitted_at AS inspection_date,
          COALESCE(NULLIF(CONCAT_WS(' / ', e.name, b.name), ''), i.location_label, i.title) AS estate_block_name,
          p.name AS recipient_name,
          p.job_title AS recipient_job_title,
          p.category AS recipient_category
        FROM actions a
        LEFT JOIN inspections i ON i.id = a.inspection_id
        LEFT JOIN estates e ON e.id = i.estate_id
        LEFT JOIN blocks b ON b.id = i.block_id
        LEFT JOIN people p ON p.id = a.recipient_person_id
        WHERE COALESCE(lower(a.status), 'open') NOT IN ('completed', 'closed')
          AND a.superseded_by IS NULL
          AND i.superseded_by IS NULL
          AND (
            lower(COALESCE(a.category, '')) IN ('repair', 'repairs')
            OR lower(COALESCE(a.category, '')) LIKE '%repair%'
            OR lower(COALESCE(a.section_name, '')) LIKE '%repair%'
            OR lower(COALESCE(a.title, '')) LIKE '%repair%'
            OR lower(COALESCE(a.description, '')) LIKE '%repair%'
            OR lower(COALESCE(a.comment, '')) LIKE '%repair%'
            OR lower(COALESCE(i.type, '')) = 'repairs_inspector'
            OR lower(COALESCE(i.template_id, '')) = 'repairs_inspector_direct'
            OR lower(COALESCE(p.name, '')) LIKE '%repair%'
            OR lower(COALESCE(p.job_title, '')) LIKE '%repair%'
            OR lower(COALESCE(p.category, '')) LIKE '%repair%'
          )
        ORDER BY a.updated_at DESC, a.created_at DESC
        LIMIT 500
      `

      return NextResponse.json(result.rows)
    } catch (fullQueryError) {
      console.warn('[repairs-inspector/actions] full query failed; retrying core action query:', fullQueryError?.message || fullQueryError)
      try {
        const fallback = await sql`
          SELECT
            a.id, a.inspection_id, a.section_id, a.section_name, a.question_id,
            a.category, a.priority, a.title, a.description, a.location, a.status, a.comment,
            a.photo_urls,
            NULL::text AS issue_pdf_url,
            NULL::text AS job_number,
            NULL::date AS expected_completion_date,
            NULL::text AS repair_notes,
            NULL::text AS repair_photo_url,
            NULL::timestamptz AS repair_updated_at,
            a.created_at, a.updated_at,
            i.title AS inspection_title,
            i.submitted_at AS inspection_date,
            COALESCE(NULLIF(CONCAT_WS(' / ', e.name, b.name), ''), i.location_label, i.title) AS estate_block_name,
            NULL::text AS recipient_name,
            NULL::text AS recipient_job_title,
            NULL::text AS recipient_category
          FROM actions a
          LEFT JOIN inspections i ON i.id = a.inspection_id
          LEFT JOIN estates e ON e.id = i.estate_id
          LEFT JOIN blocks b ON b.id = i.block_id
          WHERE COALESCE(lower(a.status), 'open') NOT IN ('completed', 'closed')
            AND a.superseded_by IS NULL
            AND i.superseded_by IS NULL
            AND (
              lower(COALESCE(a.category, '')) IN ('repair', 'repairs')
              OR lower(COALESCE(a.category, '')) LIKE '%repair%'
              OR lower(COALESCE(a.section_name, '')) LIKE '%repair%'
              OR lower(COALESCE(a.title, '')) LIKE '%repair%'
              OR lower(COALESCE(a.description, '')) LIKE '%repair%'
              OR lower(COALESCE(a.comment, '')) LIKE '%repair%'
              OR lower(COALESCE(i.type, '')) = 'repairs_inspector'
              OR lower(COALESCE(i.template_id, '')) = 'repairs_inspector_direct'
            )
          ORDER BY a.updated_at DESC, a.created_at DESC
          LIMIT 500
        `

        return NextResponse.json(fallback.rows)
      } catch (fallbackQueryError) {
        console.warn('[repairs-inspector/actions] core query failed; retrying minimum action query:', fallbackQueryError?.message || fallbackQueryError)
        const minimum = await sql`
          SELECT
            a.id, a.inspection_id, a.section_id, a.section_name, a.question_id,
            a.category, a.priority, a.title, a.description, a.location, a.status, a.comment,
            '[]'::jsonb AS photo_urls,
            NULL::text AS issue_pdf_url,
            NULL::text AS job_number,
            NULL::date AS expected_completion_date,
            NULL::text AS repair_notes,
            NULL::text AS repair_photo_url,
            NULL::timestamptz AS repair_updated_at,
            a.created_at, a.updated_at,
            i.title AS inspection_title,
            i.submitted_at AS inspection_date,
            COALESCE(i.location_label, i.title) AS estate_block_name,
            NULL::text AS recipient_name,
            NULL::text AS recipient_job_title,
            NULL::text AS recipient_category
          FROM actions a
          LEFT JOIN inspections i ON i.id = a.inspection_id
          WHERE COALESCE(lower(a.status), 'open') NOT IN ('completed', 'closed')
            AND a.superseded_by IS NULL
            AND i.superseded_by IS NULL
            AND (
              lower(COALESCE(a.category, '')) IN ('repair', 'repairs')
              OR lower(COALESCE(a.category, '')) LIKE '%repair%'
              OR lower(COALESCE(a.section_name, '')) LIKE '%repair%'
              OR lower(COALESCE(a.title, '')) LIKE '%repair%'
              OR lower(COALESCE(a.description, '')) LIKE '%repair%'
              OR lower(COALESCE(a.comment, '')) LIKE '%repair%'
              OR lower(COALESCE(i.type, '')) = 'repairs_inspector'
              OR lower(COALESCE(i.template_id, '')) = 'repairs_inspector_direct'
            )
          ORDER BY a.updated_at DESC, a.created_at DESC
          LIMIT 500
        `

        return NextResponse.json(minimum.rows)
      }
    }
  } catch (error) {
    console.error('[repairs-inspector/actions] GET:', error)
    return NextResponse.json(
      { error: 'Failed to load repair actions', details: error?.message || String(error) },
      { status: 500 }
    )
  }
}

const REPAIR_LIKE_SQL = `
  (
    lower(COALESCE(a.category, '')) IN ('repair', 'repairs')
    OR lower(COALESCE(a.category, '')) LIKE '%repair%'
    OR lower(COALESCE(a.section_name, '')) LIKE '%repair%'
    OR lower(COALESCE(a.title, '')) LIKE '%repair%'
    OR lower(COALESCE(a.description, '')) LIKE '%repair%'
    OR lower(COALESCE(a.comment, '')) LIKE '%repair%'
    OR lower(COALESCE(i.type, '')) = 'repairs_inspector'
    OR lower(COALESCE(i.template_id, '')) = 'repairs_inspector_direct'
  )`

function scopedRepairInspectorSql(visibilitySql, { people = true, superseded = true, repairColumns = true } = {}) {
  const repairSelect = repairColumns
    ? `a.photo_urls, a.issue_pdf_url, a.job_number, a.expected_completion_date,
       a.repair_notes, a.repair_photo_url, a.repair_updated_at,`
    : `'[]'::jsonb AS photo_urls,
       NULL::text AS issue_pdf_url,
       NULL::text AS job_number,
       NULL::date AS expected_completion_date,
       NULL::text AS repair_notes,
       NULL::text AS repair_photo_url,
       NULL::timestamptz AS repair_updated_at,`
  const peopleSelect = people
    ? `p.name AS recipient_name, p.job_title AS recipient_job_title, p.category AS recipient_category`
    : `NULL::text AS recipient_name, NULL::text AS recipient_job_title, NULL::text AS recipient_category`
  const peopleJoin = people ? 'LEFT JOIN people p ON p.id = a.recipient_person_id' : ''
  const supersededSql = superseded ? 'AND a.superseded_by IS NULL AND i.superseded_by IS NULL' : ''
  const place = people
    ? `COALESCE(NULLIF(CONCAT_WS(' / ', e.name, b.name), ''), i.location_label, i.title)`
    : `COALESCE(i.location_label, i.title)`
  return `
    SELECT
      a.id, a.inspection_id, a.section_id, a.section_name, a.question_id,
      a.category, a.priority, a.title, a.description, a.location, a.status, a.comment,
      ${repairSelect}
      a.created_at, a.updated_at,
      i.title AS inspection_title,
      i.submitted_at AS inspection_date,
      ${place} AS estate_block_name,
      ${peopleSelect}
    FROM actions a
    LEFT JOIN inspections i ON i.id = a.inspection_id
    LEFT JOIN estates e ON e.id = i.estate_id
    LEFT JOIN blocks b ON b.id = i.block_id
    ${peopleJoin}
    WHERE COALESCE(lower(a.status), 'open') NOT IN ('completed', 'closed')
      ${supersededSql}
      AND ${REPAIR_LIKE_SQL}
      AND ${visibilitySql}
    ORDER BY a.updated_at DESC, a.created_at DESC
    LIMIT 500`
}

async function selectScopedRepairInspectorActions(visibility) {
  const attempts = [
    { people: true, superseded: true, repairColumns: true },
    { people: false, superseded: true, repairColumns: false },
    { people: false, superseded: false, repairColumns: false },
  ]
  let lastError = null
  for (const attempt of attempts) {
    try {
      const result = await sql.query(scopedRepairInspectorSql(visibility.sql, attempt), visibility.params)
      return result.rows
    } catch (error) {
      lastError = error
    }
  }
  throw lastError
}
