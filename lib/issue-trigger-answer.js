/**
 * Per-question issue/action triggers (`triggers_issue_answer`).
 * Supports Yes, No, grades A–D, NA, and comma/semicolon/pipe-separated or JSON array values.
 * When unset, callers fall back to legacy `action_trigger_on` / `create_action_on_no` behaviour.
 */

/**
 * @param {string | boolean | null | undefined} val
 * @returns {'yes' | 'no' | ''}
 */
export function normalizeYesNoAnswer(val) {
  if (val === true || val === 'yes' || val === 'Yes') return 'yes'
  if (val === false || val === 'no' || val === 'No') return 'no'
  const s = val != null ? String(val).toLowerCase().trim() : ''
  if (s === 'yes') return 'yes'
  if (s === 'no') return 'no'
  return ''
}

/**
 * @param {unknown} p
 * @returns {string | null} normalized token: yes | no | a | b | c | d | na
 */
export function normalizeIssueTriggerToken(p) {
  if (p == null || p === '') return null
  const s = String(p).trim().toLowerCase()
  if (s === 'yes' || s === 'y' || s === 'true' || s === '1') return 'yes'
  if (s === 'no' || s === 'n' || s === 'false' || s === '0') return 'no'
  const u = String(p).trim().toUpperCase()
  if (u === 'A' || u === 'B' || u === 'C' || u === 'D') return u.toLowerCase()
  if (u === 'NA' || u === 'N/A' || s === 'n/a') return 'na'
  return null
}

/**
 * @param {Record<string, unknown> | null | undefined} question
 * @returns {string[] | null} non-empty list of normalized tokens, or null to use legacy rules only
 */
export function parseTriggersIssueAnswerList(question) {
  if (!question) return null
  const raw =
    question.triggers_issue_answer ??
    question.triggers_issue_answers ??
    question.issue_trigger_answers ??
    null
  if (raw == null || raw === '') return null
  const parts = Array.isArray(raw)
    ? raw
    : String(raw)
        .split(/[,;|]+/)
        .map((x) => x.trim())
        .filter(Boolean)
  if (parts.length === 0) return null
  const out = new Set()
  for (const p of parts) {
    const t = normalizeIssueTriggerToken(p)
    if (t) out.add(t)
  }
  const arr = [...out]
  return arr.length ? arr : null
}

/**
 * @param {unknown} gradeVal
 * @returns {string | ''} a | b | c | d | na
 */
export function normalizeGradeAnswerToken(gradeVal) {
  const g = String(gradeVal ?? '')
    .trim()
    .toLowerCase()
  if (!g) return ''
  if (g === 'n/a' || g === 'n a') return 'na'
  const c0 = g.charAt(0)
  if (['a', 'b', 'c', 'd'].includes(c0)) return c0
  if (g.startsWith('na')) return 'na'
  return ''
}
