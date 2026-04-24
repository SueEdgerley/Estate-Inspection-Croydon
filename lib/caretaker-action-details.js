/**
 * Shared helpers for caretaker auto-actions (submit + section save).
 */

import { getActionTriggerOn } from '@/lib/template-rules'

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
 * Whether an auto-created action should be created for this answer (caretaker non-NV).
 * @param {Record<string, unknown>} question
 * @param {unknown} answerVal
 * @param {Record<string, unknown> | null} [section]
 */
export function shouldAutocreateCaretakerAction(question, answerVal, section = null) {
  const norm = normalizeYesNoAnswer(answerVal)
  const dir = getActionTriggerOn(question, section)
  if (dir === 'yes') {
    if (norm !== 'yes') return false
    return question.create_action_on_yes !== false
  }
  if (norm !== 'no') return false
  return question.create_action_on_no !== false
}

/**
 * Optional graded (C/D) → action when template flags are set.
 * @param {Record<string, unknown>} question
 * @param {unknown} gradeVal
 */
export function shouldAutocreateCaretakerGradedAction(question, gradeVal) {
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
