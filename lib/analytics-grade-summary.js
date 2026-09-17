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
