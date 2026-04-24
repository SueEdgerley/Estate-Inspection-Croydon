import { withInspectionPdfDefaults } from '@/lib/inspection-pdf-fields'

/** Postgres undefined_column / common driver messages when a SELECT references a missing column. */
export function isPgMissingColumnError(err) {
  if (!err) return false
  const code = err.code
  const msg = String(err.message || '').toLowerCase()
  if (code === '42703') return true
  return msg.includes('does not exist') && msg.includes('column')
}

/**
 * Run a parameterized inspection list query, retrying with fewer PDF columns if the DB is behind on migrations.
 * @param {(sql: string, params: unknown[]) => Promise<{ rows?: unknown[] }>} run
 * @param {string[]} pdfColumnFragments — last entry must be the minimal safe fragment (e.g. `pdf_url` or `i.pdf_url`)
 * @param {(pdfCols: string) => string} buildSql — interpolated fragment only for the PDF column list
 * @param {unknown[]} params
 * @returns {Promise<Record<string, unknown>[]>}
 */
export async function queryInspectionRowsWithPdfColumnFallback(run, pdfColumnFragments, buildSql, params) {
  let lastErr
  for (let i = 0; i < pdfColumnFragments.length; i++) {
    const frag = pdfColumnFragments[i]
    const isLast = i === pdfColumnFragments.length - 1
    try {
      const result = await run(buildSql(frag), params)
      return (result.rows || []).map((r) => withInspectionPdfDefaults(r))
    } catch (e) {
      lastErr = e
      if (!isPgMissingColumnError(e) || isLast) throw e
      console.warn('[inspections list] Retrying without some PDF columns:', e?.message || e)
    }
  }
  throw lastErr
}
