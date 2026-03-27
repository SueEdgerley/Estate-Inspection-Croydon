/**
 * Find a question definition inside an inspection template snapshot (sections[].questions[]).
 */
export function findQuestionInTemplate(templateVersion, questionId) {
  if (!questionId || !templateVersion || typeof templateVersion !== 'object') return null
  const sections = Array.isArray(templateVersion.sections) ? templateVersion.sections : []
  for (const sec of sections) {
    const questions = Array.isArray(sec?.questions) ? sec.questions : []
    for (const q of questions) {
      if (q && q.id === questionId) return q
    }
  }
  return null
}
