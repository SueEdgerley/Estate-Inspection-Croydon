/**
 * Calendar-year quarters (Q1 = Jan–Mar) for manager reporting filters.
 * @param {string|number} yearStr
 * @param {string|number} quarterToken e.g. 1, "1", "Q1"
 * @returns {{ dateFrom: string, dateTo: string } | null}
 */
export function calendarQuarterToRange(yearStr, quarterToken) {
  const y = parseInt(String(yearStr ?? '').trim(), 10)
  if (!Number.isFinite(y) || y < 1970 || y > 2100) return null
  const qRaw = String(quarterToken ?? '').trim().toUpperCase().replace(/^Q/, '')
  const q = parseInt(qRaw, 10)
  if (!Number.isFinite(q) || q < 1 || q > 4) return null
  const ranges = {
    1: [`${y}-01-01`, `${y}-03-31`],
    2: [`${y}-04-01`, `${y}-06-30`],
    3: [`${y}-07-01`, `${y}-09-30`],
    4: [`${y}-10-01`, `${y}-12-31`],
  }
  const [dateFrom, dateTo] = ranges[q]
  return { dateFrom, dateTo, quarter: q, year: y }
}
