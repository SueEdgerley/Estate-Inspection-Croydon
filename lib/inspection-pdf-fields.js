/**
 * Nullable inspection PDF columns from DB or API (snake_case / camelCase).
 * Use these helpers so missing keys, null, or blank strings never throw.
 */

/**
 * Resolved URL for the full inspection report (Blob), or null if none yet.
 * @param {Record<string, unknown> | null | undefined} row
 * @returns {string | null}
 */
export function getInspectionFullReportPdfUrl(row) {
  if (!row || typeof row !== 'object') return null
  const raw =
    row.full_pdf_url ??
    row.pdf_url ??
    row.fullPdfUrl ??
    row.pdfUrl ??
    null
  if (raw == null) return null
  const t = String(raw).trim()
  return t || null
}

/**
 * Saved actions poster PDF URL (Blob), or null if none yet.
 * @param {Record<string, unknown> | null | undefined} row
 * @returns {string | null}
 */
export function getInspectionPosterPdfUrl(row) {
  if (!row || typeof row !== 'object') return null
  const raw = row.poster_pdf_url ?? row.posterPdfUrl ?? null
  if (raw == null) return null
  const t = String(raw).trim()
  return t || null
}

/**
 * Ensure PDF-related fields are always present as null (not undefined) for JSON clients.
 * @param {Record<string, unknown>} row
 * @returns {Record<string, unknown>}
 */
export function withInspectionPdfDefaults(row) {
  if (!row || typeof row !== 'object') return row
  return {
    ...row,
    full_pdf_url: row.full_pdf_url ?? null,
    pdf_url: row.pdf_url ?? null,
    poster_pdf_url: row.poster_pdf_url ?? null,
    pdf_generation_error: row.pdf_generation_error ?? null,
  }
}
