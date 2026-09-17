import { sqlExcludeFalseAutoActions } from '@/lib/false-action-cleanup'
import { parseIssueReferenceQuery } from '@/lib/issue-number'

export const ACTION_LIST_STATUSES = ['active', 'open', 'in_progress', 'completed', 'closed', 'all']

export const ACTIVE_ACTION_STATUS_SQL = `lower(trim(COALESCE(status, ''))) IN ('open', 'in_progress', 'in progress')`
export const ACTIVE_ACTION_STATUS_ALIASED = `lower(trim(COALESCE(a.status, ''))) IN ('open', 'in_progress', 'in progress')`

export function normalizeActionListStatus(value, fallback = 'active') {
  const raw = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
  if (raw === 'inprogress') return 'in_progress'
  if (ACTION_LIST_STATUSES.includes(raw)) return raw
  return fallback
}

export function sqlActionListStatusFilter(status, alias = 'a') {
  const normalized = normalizeActionListStatus(status)
  const col = `lower(trim(COALESCE(${alias}.status, '')))`
  if (normalized === 'all') return 'TRUE'
  if (normalized === 'open') return `${col} = 'open'`
  if (normalized === 'in_progress') return `${col} IN ('in_progress', 'in progress')`
  if (normalized === 'completed') return `${col} = 'completed'`
  if (normalized === 'closed') return `${col} = 'closed'`
  return `${col} IN ('open', 'in_progress', 'in progress')`
}

export function sqlExcludeFalseAutoActionsFromList(alias = 'a') {
  return sqlExcludeFalseAutoActions(alias)
}

/** Build Issues-list WHERE clauses. `startIndex` is the first $n for extra params. */
export function buildActionListWhere({
  inspectionId = null,
  questionId = null,
  status = 'active',
  search = '',
  startIndex = 1,
  includeFalseActions = false,
} = {}) {
  const clauses = [sqlActionListStatusFilter(status, 'a')]
  if (!includeFalseActions) {
    clauses.unshift(sqlExcludeFalseAutoActionsFromList('a'))
  }
  const params = []
  let n = startIndex - 1
  const placeholder = (value) => {
    params.push(value)
    n += 1
    return `$${n}`
  }

  if (inspectionId) {
    clauses.push(`a.inspection_id = ${placeholder(inspectionId)}`)
  }
  if (questionId) {
    clauses.push(`a.question_id = ${placeholder(questionId)}`)
  }

  const rawSearch = String(search || '').trim()
  if (rawSearch) {
    const issueNumber = parseIssueReferenceQuery(rawSearch)
    const like = `%${rawSearch.replace(/[%_]/g, '\\$&')}%`
    if (issueNumber != null) {
      const numberPh = placeholder(issueNumber)
      const textPh = placeholder(like)
      clauses.push(
        `(a.issue_number = ${numberPh} OR COALESCE(a.title, '') ILIKE ${textPh} ESCAPE '\\' OR COALESCE(a.comment, '') ILIKE ${textPh} ESCAPE '\\' OR COALESCE(a.description, '') ILIKE ${textPh} ESCAPE '\\')`
      )
    } else {
      const textPh = placeholder(like)
      clauses.push(
        `(COALESCE(a.title, '') ILIKE ${textPh} ESCAPE '\\' OR COALESCE(a.comment, '') ILIKE ${textPh} ESCAPE '\\' OR COALESCE(a.description, '') ILIKE ${textPh} ESCAPE '\\')`
      )
    }
  }

  return {
    sql: clauses.join(' AND '),
    params,
    status: normalizeActionListStatus(status),
    includeFalseActions: Boolean(includeFalseActions),
  }
}
