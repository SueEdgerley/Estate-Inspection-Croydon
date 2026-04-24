import { calendarQuarterToRange } from '@/lib/inspection-report-quarter'

function isoUtcDate(d) {
  return d.toISOString().slice(0, 10)
}

/**
 * Resolve inspection filter dates from URL (preset or explicit range).
 * @param {URLSearchParams} searchParams
 * @returns {{ dateFrom: string, dateTo: string, preset: string }}
 */
export function resolveAnalyticsPresetDates(searchParams) {
  const presetRaw = String(searchParams.get('preset') || '').trim().toLowerCase()
  const preset = presetRaw || 'custom'
  if (preset === 'custom') {
    return {
      dateFrom: (searchParams.get('dateFrom') || '').trim(),
      dateTo: (searchParams.get('dateTo') || '').trim(),
      preset: 'custom',
    }
  }

  const today = new Date()
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))

  if (preset === 'week') {
    const start = new Date(end)
    start.setUTCDate(start.getUTCDate() - 6)
    return { dateFrom: isoUtcDate(start), dateTo: isoUtcDate(end), preset: 'week' }
  }

  if (preset === 'month') {
    const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1))
    return { dateFrom: isoUtcDate(start), dateTo: isoUtcDate(end), preset: 'month' }
  }

  if (preset === 'quarter') {
    const y = searchParams.get('year') || String(end.getUTCFullYear())
    const q = searchParams.get('quarter') || String(Math.floor(end.getUTCMonth() / 3) + 1)
    const r = calendarQuarterToRange(y, q)
    if (r) return { dateFrom: r.dateFrom, dateTo: r.dateTo, preset: 'quarter' }
  }

  return {
    dateFrom: (searchParams.get('dateFrom') || '').trim(),
    dateTo: (searchParams.get('dateTo') || '').trim(),
    preset: 'custom',
  }
}

/**
 * Action/issue timeline defaults to the same window as inspections unless overridden.
 */
export function resolveIssueActionDates(searchParams, inspectionDateFrom, inspectionDateTo) {
  const a = (searchParams.get('issueDateFrom') || '').trim()
  const b = (searchParams.get('issueDateTo') || '').trim()
  if (a || b) {
    return { issueDateFrom: a || inspectionDateFrom, issueDateTo: b || inspectionDateTo }
  }
  return { issueDateFrom: inspectionDateFrom, issueDateTo: inspectionDateTo }
}
