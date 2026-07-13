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
