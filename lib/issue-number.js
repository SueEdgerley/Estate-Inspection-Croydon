/**
 * User-facing sequential issue references (ISS-000123).
 * Internal action UUIDs are unchanged. job_number is not used.
 */

export const ISSUE_NUMBER_PREFIX = 'ISS-'

export function formatIssueReference(issueNumber) {
  const num = Number(issueNumber)
  if (!Number.isInteger(num) || num < 1) return ''
  return `${ISSUE_NUMBER_PREFIX}${String(num).padStart(6, '0')}`
}

/**
 * Parse ISS-000123, ISS-123, iss000123, or 123 into a positive integer.
 * Returns null unless the whole query is a reference form.
 */
export function parseIssueReferenceQuery(raw) {
  const compact = String(raw || '').trim().replace(/\s+/g, '')
  if (!compact) return null
  const match = compact.match(/^(?:iss[-–]?)?0*([1-9]\d*)$/i)
  if (!match) return null
  const num = Number(match[1])
  return Number.isInteger(num) && num > 0 ? num : null
}

export function isExcludedFromIssueNumbering(repairNotes) {
  return String(repairNotes || '').includes('[FALSE_AUTO_ACTION]')
}
