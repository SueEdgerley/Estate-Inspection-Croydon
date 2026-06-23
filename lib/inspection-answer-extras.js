/**
 * Merge partial answer-extra field updates into existing per-question extras.
 * Parent state must merge with prev[questionId]; children should pass partial updates only.
 */
export function mergeInspectionAnswerExtras(prevQuestionExtras, updates) {
  const base =
    prevQuestionExtras && typeof prevQuestionExtras === 'object' && !Array.isArray(prevQuestionExtras)
      ? prevQuestionExtras
      : {}
  const patch = updates && typeof updates === 'object' && !Array.isArray(updates) ? updates : {}
  return { ...base, ...patch }
}
