import { identityOwnsInspection } from './own-record-scope.js'

/**
 * Helpers for bulk inspection-report ZIP download.
 * Filenames use recorded block names only; no estate linking.
 */

export const MAX_BULK_PDF_IDS = 80

export function normalizeBulkPdfIds(raw) {
  const source = Array.isArray(raw) ? raw : []
  const seen = new Set()
  const ids = []
  for (const value of source) {
    const id = String(value || '').trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }
  return ids
}

export function pad2(n) {
  return String(n).padStart(2, '0')
}

export function formatUkDate(value) {
  if (!value) return ''
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(d)
  const day = parts.find((part) => part.type === 'day')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const year = parts.find((part) => part.type === 'year')?.value
  if (!day || !month || !year) return ''
  return `${day}-${month}-${year}`
}

export function sanitizeFilenamePart(value) {
  const cleaned = String(value || '')
    .normalize('NFKD')
    .replace(/[^\w]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  return cleaned || ''
}

export function buildInspectionPdfFilename(row, usedNames = new Set()) {
  const location =
    sanitizeFilenamePart(row.blockName || row.block_name) ||
    sanitizeFilenamePart(row.locationLabel || row.location_label) ||
    sanitizeFilenamePart(row.estateName || row.estate_name) ||
    'inspection'
  const date =
    formatUkDate(row.submittedAt || row.submitted_at || row.createdAt || row.created_at) || 'undated'
  const base = `${location}-${date}.pdf`
  let name = base
  let n = 2
  while (usedNames.has(name.toLowerCase())) {
    name = `${location}-${date}-${n}.pdf`
    n += 1
  }
  usedNames.add(name.toLowerCase())
  return name
}

export function buildBulkZipFilename(now = new Date()) {
  return `inspection-reports-${formatUkDate(now)}.zip`
}

/** Headers for the bulk ZIP download response. */
export function bulkZipResponseHeaders(zipName, { requested, included, failed, message, contentLength } = {}) {
  const filename = String(zipName || 'inspection-reports.zip')
  const headers = {
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
    'X-Pdf-Zip-Filename': filename,
    'X-Pdf-Zip-Requested': String(requested ?? ''),
    'X-Pdf-Zip-Included': String(included ?? ''),
    'X-Pdf-Zip-Failed': String(failed ?? ''),
    'X-Pdf-Zip-Message': encodeURIComponent(String(message || '')),
    'Access-Control-Expose-Headers':
      'Content-Disposition, Content-Type, X-Pdf-Zip-Filename, X-Pdf-Zip-Requested, X-Pdf-Zip-Included, X-Pdf-Zip-Failed, X-Pdf-Zip-Message',
  }
  if (contentLength != null) headers['Content-Length'] = String(contentLength)
  return headers
}

export function formatBulkPdfZipMessage({ requested = 0, included = 0, failed = 0 } = {}) {
  const req = Number(requested) || 0
  const ok = Number(included) || 0
  const bad = Number(failed) || 0
  if (req <= 0) return 'Please select at least one inspection to download.'
  if (ok === req && bad === 0) return `${ok} of ${req} reports downloaded.`
  const failLabel = bad === 1 ? '1 report could not be generated.' : `${bad} reports could not be generated.`
  return `${ok} of ${req} reports downloaded. ${failLabel}`
}

/**
 * Server-side authorisation for selected IDs.
 * Housing Officers only keep inspections they own; managers keep all found rows.
 * Missing IDs and unauthorised IDs are failures — never included in the ZIP.
 */
export function partitionBulkPdfAccess(viewer, requestedIds, rows) {
  const byId = new Map((rows || []).map((row) => [String(row.id), row]))
  const allowed = []
  const failed = []
  for (const id of requestedIds || []) {
    const row = byId.get(id)
    if (!row) {
      failed.push({ id, reason: 'not_found', label: id })
      continue
    }
    if (viewer?.scopeOwn && !identityOwnsInspection(viewer.identity, row.inspector_id)) {
      failed.push({ id, reason: 'not_authorised', label: id })
      continue
    }
    allowed.push(row)
  }
  return { allowed, failed }
}
