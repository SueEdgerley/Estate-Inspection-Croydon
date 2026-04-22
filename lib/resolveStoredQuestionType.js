import { getEffectiveQuestionKind, normalizeQuestionType } from '@/lib/question-types'

/**
 * Maps template question → inspection_answers.question_type string used by API routes.
 */
export function resolveStoredQuestionType(questionDef) {
  if (!questionDef) return 'text'
  const kind = getEffectiveQuestionKind(questionDef)
  if (kind === 'nv_standard') return 'graded'
  if (kind === 'nv_estate_feedback' || kind === 'nv_issues_report' || kind === 'nv_plain_textarea') return 'text'
  if (kind === 'graded') return 'graded'
  if (kind === 'yes_no') return 'yesno'
  if (kind === 'rating') return 'rating'
  if (kind === 'single_select' || kind === 'select') return 'single_select'
  if (kind === 'instruction') return 'text'
  const n = normalizeQuestionType(questionDef.question_type)
  if (n === 'yes_no') return 'yesno'
  if (n === 'graded') return 'graded'
  return n || 'text'
}
