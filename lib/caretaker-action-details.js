/**
 * Shared helpers for caretaker auto-actions (submit + section save).
 */

import { getActionTriggerOn } from '@/lib/template-rules'
import {
  normalizeGradeAnswerToken,
  normalizeYesNoAnswer,
  parseTriggersIssueAnswerList,
} from '@/lib/issue-trigger-answer'

export { normalizeYesNoAnswer } from '@/lib/issue-trigger-answer'

/**
 * Whether an auto-created action should be created for this answer (caretaker non-NV).
 * If `triggers_issue_answer` is set, an issue is created only when the normalized answer is in that list.
 * Otherwise legacy rules: default No = issue, or Yes = issue when `action_trigger_on` / fire-safety patch says so.
 * @param {Record<string, unknown>} question
 * @param {unknown} answerVal
 * @param {Record<string, unknown> | null} [section]
 */
export function shouldAutocreateCaretakerAction(question, answerVal, section = null) {
  const norm = normalizeYesNoAnswer(answerVal)
  const triggers = parseTriggersIssueAnswerList(question)
  if (triggers && triggers.length > 0) {
    if (!norm) return false
    if (!triggers.includes(norm)) return false
    if (norm === 'yes') return question.create_action_on_yes !== false
    if (norm === 'no') return question.create_action_on_no !== false
    return true
  }
  const dir = getActionTriggerOn(question, section)
  if (dir === 'yes') {
    if (norm !== 'yes') return false
    return question.create_action_on_yes !== false
  }
  if (norm !== 'no') return false
  return question.create_action_on_no !== false
}

/**
 * Graded questions: optional C/D → action when template flags are set, or when `triggers_issue_answer` lists grades.
 * @param {Record<string, unknown>} question
 * @param {unknown} gradeVal
 */
export function shouldAutocreateCaretakerGradedAction(question, gradeVal) {
  const triggers = parseTriggersIssueAnswerList(question)
  if (triggers && triggers.length > 0) {
    const tok = normalizeGradeAnswerToken(gradeVal)
    if (!tok) return false
    return triggers.includes(tok)
  }
  const g = String(gradeVal ?? '')
    .trim()
    .toUpperCase()
  if (g === 'C' && question.create_action_on_c === true) return true
  if (g === 'D' && question.create_action_on_d === true) return true
  return false
}

/**
 * Rich description stored on actions for routing and email context.
 */
export function buildCaretakerActionDescription({
  inspectionId,
  completedAtIso,
  estateBlockLine,
  sectionName,
  questionText,
  answerLabel,
  comment,
  photoRefs,
  category,
  assigneeLabel,
  submittedBy,
}) {
  const lines = [
    `Inspection ID: ${inspectionId || '—'}`,
    completedAtIso ? `Date/time: ${completedAtIso}` : null,
    estateBlockLine ? `Estate / block: ${estateBlockLine}` : null,
    sectionName ? `Section: ${sectionName}` : null,
    questionText ? `Question: ${questionText}` : null,
    answerLabel ? `Answer: ${answerLabel}` : null,
    comment ? `Comment: ${comment}` : null,
    photoRefs && String(photoRefs).trim() ? `Photo reference(s): ${photoRefs}` : null,
    category ? `Action category: ${category}` : null,
    assigneeLabel ? `Assigned to: ${assigneeLabel}` : null,
    submittedBy ? `Submitted by: ${submittedBy}` : null,
  ]
  return lines.filter(Boolean).join('\n')
}
