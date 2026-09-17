/**
 * Selection rules for a future historical false-action clean-up.
 * Identification only — this module never writes to the database.
 */

export const OPENISH_ACTION_STATUSES = ['open', 'in_progress', 'in progress']

export function isOpenishActionStatus(status) {
  return OPENISH_ACTION_STATUSES.includes(String(status || '').toLowerCase().trim())
}

function normalizeGrade(answer) {
  const raw = String(answer || '').trim().toUpperCase().replace(/\s+/g, '')
  if (raw === 'N/A' || raw === 'N.A.' || raw === 'N.A' || raw === 'NA') return 'NA'
  if (raw === 'A' || raw === 'B' || raw === 'C' || raw === 'D') return raw
  return ''
}

export function isTrivialGroundsLitterComment(comment) {
  const collapsed = String(comment || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
  return ['', 'na', 'n a', 'yes', 'b', 'no', 'ok'].includes(collapsed)
}

export function isHighConfidenceEsmFalseAction({ grade, comment, raiseIssue } = {}) {
  const token = normalizeGrade(grade)
  if (!['A', 'B', 'NA'].includes(token)) return false
  if (raiseIssue === true) return false
  return !String(comment || '').trim()
}

export function isHighConfidenceCaretakerQ12FalseAction({ questionId, autoCreated, comment } = {}) {
  if (String(questionId || '') !== 'cm_canonical_internal_cleaning_q12') return false
  if (autoCreated === false) return false
  return !String(comment || '').trim()
}

export function isHighConfidenceGroundsS3FalseAction({ questionId, answer, comment } = {}) {
  if (String(questionId || '') !== 'gm_s3_q1') return false
  if (String(answer || '').trim().toLowerCase() !== 'yes') return false
  return isTrivialGroundsLitterComment(comment)
}

export const FALSE_ACTION_VOID_MARKER = '[FALSE_AUTO_ACTION]'

export const FALSE_ACTION_VOID_NOTE =
  '[FALSE_AUTO_ACTION] Auto-created in error from a non-issue answer. Inspection answers, photos, question snapshots and reports were not changed. Closed to remove from the open backlog while retaining an audit trail.'

/** SQL predicate: this action must not be counted in Analytics issue/action statistics. */
export function sqlExcludeFalseAutoActions(alias = 'a') {
  return `strpos(COALESCE(${alias}.repair_notes, ''), '${FALSE_ACTION_VOID_MARKER}') = 0`
}

export function isExcludedFromAnalytics(repairNotes) {
  return String(repairNotes || '').includes(FALSE_ACTION_VOID_MARKER)
}

export function withFalseAutoActionAuditNote(existingNotes) {
  const current = String(existingNotes || '').trim()
  if (current.includes(FALSE_ACTION_VOID_MARKER)) return current
  if (!current) return FALSE_ACTION_VOID_NOTE
  return `${current}\n\n${FALSE_ACTION_VOID_NOTE}`
}
