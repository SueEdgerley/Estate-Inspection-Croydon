import { parseLabelledDescription, displayActionStatus } from '@/lib/action-display-formatter'
import { buildCaretakerInspectionReportUrl } from '@/lib/caretaker-estates-mailbox-notification'
import { formatIssueReference } from '@/lib/issue-number'

export const ACTION_EXPORT_COLUMNS = [
  'Action reference',
  'Date raised',
  'Inspection submitted',
  'Notification sent',
  'Caretaker’s name',
  'Block/address',
  'Question',
  'Answer',
  'Comments',
  'Photo links',
  'Inspection report link',
  'Assigned officer',
  'Priority',
  'Status',
  'Job number',
  'Expected completion date',
  'Completion date',
  'Progress/completion notes',
]

/**
 * Date raised is the action row’s created_at. Inspection submitted is the
 * inspection’s own submitted or created time, and is never copied from the
 * action. Notification sent is the time the email provider accepted the
 * estates notification. Completion date is completed_at, which is set only
 * when an action is marked Completed after this field existed. Blank means
 * that time was not recorded. Progress notes are the recorded repair notes.
 */

function collapse(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function personName(value) {
  const text = collapse(value)
  if (!text || text.includes('@')) return ''
  if (text.toLowerCase() === 'inspector' || text.toLowerCase() === 'assigned') return ''
  return text
}

function photoUrls(value) {
  if (Array.isArray(value)) return value.map((url) => collapse(url)).filter(Boolean)
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) return parsed.map((url) => collapse(url)).filter(Boolean)
    } catch {
      return [value.trim()]
    }
  }
  return []
}

function formatRecordedDate(value) {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('en-GB', {
    timeZone: 'Europe/London',
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDateOnly(value) {
  if (!value) return ''
  const text = value instanceof Date ? '' : collapse(value)
  const prefix = text.match(/^(\d{4}-\d{2}-\d{2})/)
  if (prefix) return prefix[1]
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
}

function questionText(action, parsed) {
  if (parsed.question) return parsed.question
  const title = collapse(action.title)
  const parts = title.split(/\s[–-]\s/)
  return parts.length > 1 ? parts.slice(1).join(' – ') : title
}

/**
 * Quote CSV cells and neutralise spreadsheet formulas.
 * A leading =, +, -, @, tab, or carriage return is prefixed with a quote.
 */
export function escapeCsvCell(value) {
  let text = value == null ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

export function actionExportRow(action, baseUrl) {
  const parsed = parseLabelledDescription(action?.description)
  const caretaker =
    personName(action?.inspection_inspector_name) ||
    personName(action?.inspection_completed_by_name) ||
    personName(action?.inspection_created_by_name)
  const priority = collapse(action?.priority)
  return [
    formatIssueReference(action?.issue_number),
    formatRecordedDate(action?.created_at),
    formatRecordedDate(action?.inspection_submitted_at || action?.inspection_created_at || null),
    formatRecordedDate(action?.notification_sent_at),
    caretaker,
    collapse(action?.block_name) || collapse(action?.estate_block_name) || collapse(action?.location),
    questionText(action, parsed),
    parsed.answer || '',
    collapse(action?.comment) || parsed.comment || '',
    photoUrls(action?.photo_urls).join(' | '),
    buildCaretakerInspectionReportUrl(action?.inspection_id, baseUrl),
    personName(action?.assigned_to),
    priority ? displayActionStatus(priority, '') : '',
    displayActionStatus(action?.status),
    collapse(action?.job_number),
    formatDateOnly(action?.expected_completion_date),
    formatRecordedDate(action?.completed_at),
    collapse(action?.repair_notes),
  ]
}

export function buildActionsExportCsv(actions, { baseUrl } = {}) {
  const lines = [
    ACTION_EXPORT_COLUMNS.map((column) => escapeCsvCell(column)).join(','),
    ...(Array.isArray(actions) ? actions : []).map((action) =>
      actionExportRow(action, baseUrl).map((cell) => escapeCsvCell(cell)).join(',')
    ),
  ]
  return `\uFEFF${lines.join('\r\n')}\r\n`
}
