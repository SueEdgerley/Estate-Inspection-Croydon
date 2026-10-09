/**
 * Inspection report dates: the banner date is when the inspection happened,
 * not when it was later submitted or recovered. submitted_at stays available
 * for audit only.
 */

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value == null) continue
    const text = String(value).trim()
    if (text) return text
  }
  return ''
}

/**
 * Format a calendar date in en-GB without shifting YYYY-MM-DD across time zones.
 * @param {unknown} value
 * @returns {string}
 */
export function formatInspectionReportDate(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?!T)/)
  if (dateOnly) {
    const year = Number(dateOnly[1])
    const month = Number(dateOnly[2])
    const day = Number(dateOnly[3])
    const date = new Date(year, month - 1, day)
    if (Number.isNaN(date.getTime())) return ''
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  }
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-GB', {
    timeZone: 'Europe/London',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/**
 * Format a submission / audit timestamp in UK local time, including the clock.
 * @param {unknown} value
 * @returns {string}
 */
export function formatInspectionReportDateTime(value) {
  if (value == null || value === '') return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('en-GB', {
    timeZone: 'Europe/London',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Choose the inspection date for the report header.
 * Walkabout never falls back to submitted_at (recovery/submit day).
 * Other forms still use submitted_at only when no inspection/start date exists.
 *
 * @param {{
 *   inspectionRow?: Record<string, unknown>,
 *   answers?: Record<string, unknown>,
 *   isWalkabout?: boolean,
 * }} opts
 */
export function resolveInspectionReportDates({
  inspectionRow = {},
  answers = {},
  isWalkabout = false,
} = {}) {
  const inspectionDate = firstNonEmpty(
    answers.ew_sig_inspection_date,
    answers.ew_q_planned_date,
    inspectionRow.inspection_start_time
  )
  const submittedAt = inspectionRow.submitted_at || null
  return {
    inspectionDate: inspectionDate || (isWalkabout ? '' : firstNonEmpty(submittedAt)),
    submittedAt,
  }
}
