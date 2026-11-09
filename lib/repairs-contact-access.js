import { randomBytes } from 'crypto'
import { NextResponse } from 'next/server'
import { currentUser } from '@clerk/nextjs/server'
import { sql } from '@vercel/postgres'
import { getPgUrl } from '@/lib/db'
import { getAppRoleContextForClerkUser } from '@/lib/app-role-access'
import {
  duplicateIdsByAction,
  isRepairsContactAccess,
  repairsQueueMembershipSql,
  repairsQueueSearchClause,
  repairsQueueStatusSql,
  repairsRecordFlags,
  selectRepairsMailbox,
} from '@/lib/repairs-contact-rules'
import { formatIssueReference } from '@/lib/issue-number'
import { ensureIssueNumberFields } from '@/lib/issue-number-fields'

export async function ensureRepairsProgressTable() {
  if (!getPgUrl()) return
  await sql`
    CREATE TABLE IF NOT EXISTS action_progress_updates (
      id VARCHAR(255) PRIMARY KEY,
      action_id VARCHAR(255) NOT NULL REFERENCES actions(id) ON DELETE CASCADE,
      author_email VARCHAR(255),
      note TEXT,
      status_before VARCHAR(50),
      status_after VARCHAR(50),
      photo_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  await sql`
    CREATE INDEX IF NOT EXISTS action_progress_updates_action_id_created_at_idx
      ON action_progress_updates (action_id, created_at ASC)
  `
}

export async function resolveRepairsMailbox() {
  const result = await sql`
    SELECT id, name, role, job_title, category, active
    FROM people
    WHERE COALESCE(active, true) = true
      AND lower(trim(COALESCE(category, ''))) IN ('issue_recipient', 'issue recipient')
  `
  return selectRepairsMailbox(result.rows)
}

export async function forbidRepairsContactRequest(clerkUserId) {
  if (!clerkUserId) return null
  try {
    let clerkIsAdmin = false
    let metadata = null
    try {
      const cu = await currentUser()
      clerkIsAdmin = cu?.publicMetadata?.isAdmin === true
      metadata = { ...cu?.publicMetadata, ...cu?.privateMetadata, ...cu?.unsafeMetadata }
    } catch {
      /* role lookup still uses the stored system role */
    }
    const roleCtx = await getAppRoleContextForClerkUser(clerkUserId, clerkIsAdmin, metadata)
    if (!isRepairsContactAccess(roleCtx)) return null
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  } catch {
    return null
  }
}

const QUEUE_COLUMNS = `
  a.id, a.category, a.priority, a.title, a.description, a.location, a.status, a.comment,
  a.photo_urls, a.job_number, a.expected_completion_date, a.repair_notes, a.repair_photo_url,
  a.repair_updated_at, a.recipient_person_id, a.issue_number, a.created_at, a.updated_at,
  i.title AS inspection_title,
  i.submitted_at AS inspection_date,
  COALESCE(NULLIF(CONCAT_WS(' / ', e.name, b.name), ''), i.location_label, a.location, i.title) AS estate_block_name,
  p.name AS recipient_name
`

const QUEUE_FROM = `
  FROM actions a
  LEFT JOIN inspections i ON i.id = a.inspection_id
  LEFT JOIN estates e ON e.id = i.estate_id
  LEFT JOIN blocks b ON b.id = COALESCE(a.block_id, i.block_id)
  LEFT JOIN people p ON p.id = a.recipient_person_id
`

function queueFilters({ mailboxId, search, status, raised }) {
  const params = [mailboxId]
  const membership = repairsQueueMembershipSql('$1')
  const statusFilter = repairsQueueStatusSql(status)
  const clauses = [membership, statusFilter.sql]
  let nextIndex = 2
  const searchClause = repairsQueueSearchClause(search, nextIndex, { includePlaceNames: true })
  if (searchClause.sql) {
    clauses.push(searchClause.sql)
    params.push(...searchClause.params)
    nextIndex += searchClause.params.length
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(raised || '').trim())) {
    clauses.push(`a.created_at::date = $${nextIndex}::date`)
    params.push(String(raised).trim())
  }
  return { where: clauses.join(' AND '), params, status: statusFilter.status }
}

async function queryQueue(text, params) {
  try {
    return await sql.query(text.replace('/*superseded*/', 'AND a.superseded_by IS NULL'), params)
  } catch (error) {
    if (error?.code !== '42703') throw error
    return await sql.query(text.replace('/*superseded*/', ''), params)
  }
}

export async function listRepairsQueue({
  mailboxId,
  search = '',
  status = 'outstanding',
  raised = '',
  page = 1,
  pageSize = 25,
  maxPageSize = 50,
} = {}) {
  await ensureIssueNumberFields(sql)
  const size = Math.min(maxPageSize, Math.max(1, Number(pageSize) || 25))
  const requestedPage = Math.max(1, Number(page) || 1)
  const filters = queueFilters({ mailboxId, search, status, raised })
  const countResult = await queryQueue(
    `SELECT COUNT(*)::int AS total ${QUEUE_FROM} WHERE ${filters.where} /*superseded*/`,
    filters.params
  )
  const total = Number(countResult.rows[0]?.total || 0)
  const pageCount = Math.max(1, Math.ceil(total / size))
  const currentPage = Math.min(requestedPage, pageCount)
  const offset = (currentPage - 1) * size
  const pageParams = [...filters.params, size, offset]
  const limitIndex = filters.params.length + 1
  const result = await queryQueue(
    `SELECT ${QUEUE_COLUMNS} ${QUEUE_FROM}
     WHERE ${filters.where} /*superseded*/
     ORDER BY a.created_at ASC, a.id ASC
     LIMIT $${limitIndex} OFFSET $${limitIndex + 1}`,
    pageParams
  )
  const keys = await queryQueue(
    `SELECT a.id,
            COALESCE(a.block_id, i.block_id, '') AS block_key,
            lower(trim(COALESCE(a.description, a.title, ''))) AS text_key,
            COALESCE(a.inspection_id, '') AS inspection_id,
            COALESCE(a.question_id, '') AS question_id
     ${QUEUE_FROM}
     WHERE ${repairsQueueMembershipSql('$1')} /*superseded*/`,
    [mailboxId]
  )
  const duplicates = duplicateIdsByAction(keys.rows)
  const progress = await listRepairsProgress(result.rows.map((action) => action.id))
  const withProgress = attachRepairsProgress(result.rows, progress)
  const actions = withProgress.map((action) => ({
    ...action,
    issue_reference: formatIssueReference(Number(action.issue_number)),
    flags: repairsRecordFlags(action, mailboxId, duplicates.get(action.id) || []),
  }))
  return {
    actions,
    total,
    page: currentPage,
    pageSize: size,
    status: filters.status,
  }
}

export async function listRepairsMailboxActions(mailboxId) {
  const queue = await listRepairsQueue({
    mailboxId,
    status: 'outstanding',
    page: 1,
    pageSize: 500,
    maxPageSize: 500,
  })
  return queue.actions
}

export async function listRepairsProgress(actionIds) {
  const ids = (Array.isArray(actionIds) ? actionIds : []).map((id) => String(id || '').trim()).filter(Boolean)
  if (!ids.length) return []
  await ensureRepairsProgressTable()
  const result = await sql.query(
    `SELECT id, action_id, author_email, note, status_before, status_after, photo_url, created_at
     FROM action_progress_updates
     WHERE action_id = ANY($1::text[])
     ORDER BY created_at ASC`,
    [ids]
  )
  return result.rows
}

export function attachRepairsProgress(actions, progressRows) {
  const byAction = new Map()
  for (const row of progressRows || []) {
    const key = String(row.action_id)
    const current = byAction.get(key) || []
    current.push(row)
    byAction.set(key, current)
  }
  return (actions || []).map((action) => ({
    ...action,
    progress: byAction.get(String(action.id)) || [],
  }))
}

export async function recordRepairsProgress({
  actionId,
  authorEmail,
  note,
  statusBefore,
  statusAfter,
  photoUrl,
}) {
  await ensureRepairsProgressTable()
  const id = `progress_${randomBytes(8).toString('hex')}`
  await sql`
    INSERT INTO action_progress_updates (
      id, action_id, author_email, note, status_before, status_after, photo_url
    )
    VALUES (
      ${id},
      ${actionId},
      ${authorEmail || null},
      ${note != null ? String(note) : null},
      ${statusBefore || null},
      ${statusAfter || null},
      ${photoUrl || null}
    )
  `
  return id
}

export function repairsMailboxError(resolved) {
  if (resolved?.mailbox) return null
  return NextResponse.json(
    {
      error: 'The Repairs mailbox could not be identified uniquely.',
      matches: (resolved?.matches || []).map((person) => ({
        id: person.id,
        name: person.name,
        role: person.role,
      })),
    },
    { status: 409 }
  )
}

export { isRepairsContactAccess }
