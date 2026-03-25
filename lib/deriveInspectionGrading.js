/**
 * Maps template graded answers to inspections.grading (VARCHAR): first non-empty
 * graded question in template section order (matches typical single overall grade UX).
 */
export function deriveInspectionGrading(template, answersByQuestionId) {
  if (!template?.sections || !answersByQuestionId || typeof answersByQuestionId !== 'object') {
    return null
  }
  for (const sec of template.sections) {
    for (const q of sec.questions || []) {
      const qt = String(q.question_type || '').toLowerCase()
      if (qt !== 'graded') continue
      const v = answersByQuestionId[q.id]
      if (v !== undefined && v !== null && String(v).trim() !== '') {
        return String(v).trim().slice(0, 50)
      }
    }
  }
  return null
}
