import { calendarQuarterToRange } from './inspection-report-quarter.js'

function isoUtcDate(d) {
  return d.toISOString().slice(0, 10)
}

/** Home operational overview presets (subset + extensions of analytics). */
export const HOME_PERIOD_PRESETS = [
  { value: 'month', label: 'This month' },
  { value: 'last_30', label: 'Last 30 days' },
  { value: 'year', label: 'This year' },
  { value: 'all', label: 'All time' },
]

export function homePeriodPresetLabel(preset) {
  const found = HOME_PERIOD_PRESETS.find((p) => p.value === preset)
  return found?.label || 'Custom range'
}

/**
 * Resolve inspection filter dates from URL (preset or explicit range).
 * Existing analytics presets (week/month/quarter/custom) are unchanged.
 * Home-friendly extensions: last_30, year, all — safe extras that fall through
 * unused by Analytics UI unless a client sends those query values.
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

  if (preset === 'last_30' || preset === 'last30' || preset === '30d') {
    const start = new Date(end)
    start.setUTCDate(start.getUTCDate() - 29)
    return { dateFrom: isoUtcDate(start), dateTo: isoUtcDate(end), preset: 'last_30' }
  }

  if (preset === 'year' || preset === 'this_year') {
    const start = new Date(Date.UTC(end.getUTCFullYear(), 0, 1))
    return { dateFrom: isoUtcDate(start), dateTo: isoUtcDate(end), preset: 'year' }
  }

  if (preset === 'all' || preset === 'all_time') {
    return { dateFrom: '', dateTo: '', preset: 'all' }
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
