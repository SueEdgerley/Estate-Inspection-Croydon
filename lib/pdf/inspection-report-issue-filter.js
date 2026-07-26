/**
 * Presentation helpers for the full inspection PDF.
 * Photos alone must not appear as Issues Raised.
 */

function normalizeAnswerToken(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/^GRADE[\s_-]*/i, '')
    .replace(/\s+/g, ' ')
}

export function answerLooksLikeYes(value) {
  const v = String(value || '')
    .trim()
    .toLowerCase()
  return v === 'yes' || v === 'y' || v === 'true' || v === '1'
}

export function answerLooksLikeGoodGrade(value) {
  const v = normalizeAnswerToken(value)
  return v === 'A' || v === 'B' || v === 'NA' || v === 'N/A' || v === 'N A'
}

export function answerLooksLikePoorGrade(value) {
  const v = normalizeAnswerToken(value)
  return v === 'C' || v === 'D'
}

/**
 * Decide whether an actions row should appear under “Issues Raised” in the PDF.
 * Photo-only evidence linked to acceptable grades is evidence, not an issue.
 */
export function isPdfReportableIssue(row, answerByQuestionId = {}) {
  const answer = answerByQuestionId[row?.question_id]
  if (answerLooksLikeYes(answer)) return true
  if (answerLooksLikePoorGrade(answer)) return true

  const category = String(row?.category || '')
    .trim()
    .toLowerCase()
  if (category === 'esm_photo_comment_issue') return false
  if (row?.auto_created && answerLooksLikeGoodGrade(answer)) return false
  if (answerLooksLikeGoodGrade(answer) && /^esm_/.test(category)) return false
  return true
}

/**
 * Collect finding question ids already rendered in Inspection Findings.
 * @param {Array<{ questions?: Array<{ id?: string }> }>} sections
 * @returns {Set<string>}
 */
export function collectFindingQuestionIds(sections) {
  const ids = new Set()
  for (const section of sections || []) {
    for (const q of section.questions || []) {
      const id = String(q?.id || '').trim()
      if (id) ids.add(id)
    }
  }
  return ids
}

/**
 * Walkabout PDF: drop Issues Raised rows already shown as findings
 * (standard checklist expansion + Additional items rows). Keep only actions
 * with genuinely different info (no matching findings question id).
 *
 * @param {Array<{ questionId?: string|null, isReportableIssue?: boolean }>} actions
 * @param {Array<{ questions?: Array<{ id?: string }> }>} sections
 */
export function filterWalkaboutIssuesAlreadyInFindings(actions, sections) {
  const findingIds = collectFindingQuestionIds(sections)
  return (actions || []).filter((action) => {
    if (action?.isReportableIssue === false) return false
    const qid = String(action?.questionId || '').trim()
    if (!qid) return true
    return !findingIds.has(qid)
  })
}
