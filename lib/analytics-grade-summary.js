/**
 * Question-level A/B/C/D aggregation for Analytics management reporting.
 * NA is stored but excluded from the A–D percentage denominator.
 * Caretaker Yes/No answers are not grades and must not be passed in.
 */

export const ATTENTION_BLOCK_MIN_GRADED = 10
export const ATTENTION_BLOCK_LIMIT = 3

export function parseGradeToken(value) {
  const raw = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/^GRADE[\s_-]*/i, '')
    .replace(/\s+/g, '')
  if (raw === 'N/A' || raw === 'N.A.' || raw === 'N.A' || raw === 'NA') return 'NA'
  if (raw === 'A' || raw === 'B' || raw === 'C' || raw === 'D') return raw
  return null
}

/** One decimal place; null when there is no A–D population. */
export function pct1(part, whole) {
  const w = Number(whole) || 0
  if (w <= 0) return null
  return Math.round((1000 * (Number(part) || 0)) / w) / 10
}

export function gradedAnswerTokenSql(alias = 'ia') {
  return `upper(regexp_replace(trim(COALESCE(${alias}.answer_value, ${alias}.answer_text, '')), '^GRADE[[:space:]_-]*', '', 'i'))`
}

export function gradedAbcdSql(alias = 'ia') {
  const token = gradedAnswerTokenSql(alias)
  return `CASE
    WHEN ${token} IN ('A','B','C','D') THEN ${token}
    WHEN ${token} IN ('NA','N/A','N.A.','N.A') THEN 'NA'
    ELSE NULL
  END`
}

export function summariseAbcd({ a = 0, b = 0, c = 0, d = 0, na = 0 } = {}) {
  const A = Number(a) || 0
  const B = Number(b) || 0
  const C = Number(c) || 0
  const D = Number(d) || 0
  const NA = Number(na) || 0
  const abcd = A + B + C + D
  const ab = A + B
  const cd = C + D
  return {
    a: A,
    b: B,
    c: C,
    d: D,
    na: NA,
    abcd,
    ab,
    cd,
    aPct: pct1(A, abcd),
    bPct: pct1(B, abcd),
    cPct: pct1(C, abcd),
    dPct: pct1(D, abcd),
    abPct: pct1(ab, abcd),
    cdPct: pct1(cd, abcd),
  }
}

export function formatCdShare(cd, gradedAbcd) {
  const pct = pct1(cd, gradedAbcd)
  const n = Number(cd) || 0
  const d = Number(gradedAbcd) || 0
  if (!d) return '—'
  return `${n} / ${d} — ${pct}% C/D`
}

/**
 * Existing Analytics numeric scale (also used by gradeExpr on inspections.grading).
 * A is best. Do not invert this to A=1.
 */
export const GRADE_SCORE = { A: 4, B: 3, C: 2, D: 1 }

export function gradedAnswerScoreSql(alias = 'ia') {
  const token = gradedAbcdSql(alias)
  return `CASE (${token})
    WHEN 'A' THEN 4
    WHEN 'B' THEN 3
    WHEN 'C' THEN 2
    WHEN 'D' THEN 1
    ELSE NULL
  END`
}

export function gradeToScore(grade) {
  const token = parseGradeToken(grade)
  if (token === 'A' || token === 'B' || token === 'C' || token === 'D') return GRADE_SCORE[token]
  return null
}

/**
 * Cautious midpoint banding. Exact midpoints fall to the lower grade:
 * A >3.50–4.00, B >2.50–3.50, C >1.50–2.50, D 1.00–1.50.
 */
export function scoreToGrade(score) {
  const n = Number(score)
  if (!Number.isFinite(n)) return null
  if (n > 3.5) return 'A'
  if (n > 2.5) return 'B'
  if (n > 1.5) return 'C'
  if (n >= 1) return 'D'
  return null
}

export function roundGradeScore(score) {
  const n = Number(score)
  if (!Number.isFinite(n)) return null
  return Math.round(n * 100) / 100
}

function toIsoOrNull(value) {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export function mapBlockAverageRow(row) {
  const avgScore = roundGradeScore(row.avgScore ?? row.avg_score)
  const latestScore = roundGradeScore(row.latestScore ?? row.latest_score)
  return {
    blockId: row.blockId ?? row.block_id ?? '',
    blockName: row.blockName ?? row.block_name ?? 'Unknown block',
    gradedInspections: Number(row.gradedInspections ?? row.graded_inspections ?? 0) || 0,
    avgScore,
    avgGrade: scoreToGrade(avgScore),
    latestScore,
    latestGrade: scoreToGrade(latestScore),
    latestSubmittedAt: toIsoOrNull(row.latestSubmittedAt ?? row.latest_submitted_at),
  }
}

function compareNullableNumber(a, b) {
  const left = Number(a)
  const right = Number(b)
  const leftOk = Number.isFinite(left)
  const rightOk = Number.isFinite(right)
  if (!leftOk && !rightOk) return 0
  if (!leftOk) return 1
  if (!rightOk) return -1
  return left - right
}

export function sortBlockAverageRows(rows, sortKey = 'avgScore', dir = 'asc') {
  const mul = dir === 'desc' ? -1 : 1
  return [...(rows || [])].sort((left, right) => {
    let cmp = 0
    if (sortKey === 'block') {
      cmp = String(left.blockName || '').localeCompare(String(right.blockName || ''), 'en', { sensitivity: 'base' })
    } else if (sortKey === 'inspections') {
      cmp = (Number(left.gradedInspections) || 0) - (Number(right.gradedInspections) || 0)
    } else if (sortKey === 'latestGrade') {
      cmp = compareNullableNumber(left.latestScore, right.latestScore)
    } else if (sortKey === 'latestDate') {
      cmp = String(left.latestSubmittedAt || '').localeCompare(String(right.latestSubmittedAt || ''))
    } else {
      cmp = compareNullableNumber(left.avgScore, right.avgScore)
    }
    if (cmp !== 0) return cmp * mul
    const inspectCmp = (Number(right.gradedInspections) || 0) - (Number(left.gradedInspections) || 0)
    if (inspectCmp !== 0) return inspectCmp
    return String(left.blockName || '').localeCompare(String(right.blockName || ''), 'en', { sensitivity: 'base' })
  })
}

/**
 * Rank blocks by C/D % of graded A–D checks. Requires a minimum sample size.
 * Raw C/D count is retained as supporting information, not the rank key.
 */
export function rankAttentionBlocks(rows, { minGraded = ATTENTION_BLOCK_MIN_GRADED, limit = ATTENTION_BLOCK_LIMIT } = {}) {
  return (rows || [])
    .map((row) => {
      const gradedAbcd = Number(row.gradedAbcd ?? row.graded_abcd ?? 0) || 0
      const c = Number(row.c ?? 0) || 0
      const d = Number(row.d ?? 0) || 0
      const cd = Number(row.cd ?? row.cdCount ?? c + d) || 0
      const ab = Number(row.ab ?? Math.max(0, gradedAbcd - cd)) || 0
      return {
        blockId: row.blockId ?? row.block_id ?? '',
        blockName: row.blockName ?? row.block_name ?? 'Unknown block',
        estateName: row.estateName ?? row.estate_name ?? '',
        a: Number(row.a ?? 0) || 0,
        b: Number(row.b ?? 0) || 0,
        c,
        d,
        ab,
        cd,
        gradedAbcd,
        cdPct: pct1(cd, gradedAbcd),
        display: formatCdShare(cd, gradedAbcd),
      }
    })
    .filter((row) => row.gradedAbcd >= minGraded)
    .sort((left, right) => {
      const pctDiff = (right.cdPct ?? -1) - (left.cdPct ?? -1)
      if (pctDiff !== 0) return pctDiff
      if (right.cd !== left.cd) return right.cd - left.cd
      if (right.d !== left.d) return right.d - left.d
      return right.gradedAbcd - left.gradedAbcd
    })
    .slice(0, limit)
}
