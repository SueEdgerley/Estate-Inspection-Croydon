/**
 * Shared question-type normalization for forms (Airtable + template_version snapshots).
 * Keeps wizard, QuestionRenderer, and new-inspection form aligned.
 */

export function normalizeQuestionType(v) {
  if (v == null || v === '') return 'text'
  const raw = String(v).toLowerCase().trim()
  if (raw.includes('yes_no')) return 'yes_no'
  if (/yes\s*[\/\-]?\s*no|yesno|yes\s+no/.test(raw)) return 'yes_no'
  if (raw.includes('yes') && raw.includes('no')) return 'yes_no'
  const s = raw.replace(/[\s\-/]+/g, '_').replace(/_+$/g, '') || 'text'
  return s === 'yesno' ? 'yes_no' : s
}

/**
 * Effective render kind for a question object (may include answer_mode fallback).
 */
export function getEffectiveQuestionKind(question) {
  if (!question) return 'text'
  const raw = question.question_type ?? question.answer_mode
  const inferredYesNo =
    (question.comment_required_when === 'on_no' || question.photo_required_when === 'on_no') &&
    (raw == null || raw === '')
  const normalized = normalizeQuestionType(raw || (inferredYesNo ? 'yes_no' : 'text'))
  if (normalized !== 'text') return normalized

  // Caretaker fallback: when options exist but type is missing, render as dropdown.
  const hasOptions =
    (Array.isArray(question.options) && question.options.length > 0) ||
    (typeof question.options === 'string' && question.options.trim() !== '')
  if (hasOptions) return 'single_select'

  // Guidance/instruction rows should render as non-answerable informational text.
  const prompt = String(question.label ?? question.question_text ?? '').toLowerCase().trim()
  if (/\b(instruction|guidance|for guidance|please note|note:)\b/.test(prompt)) {
    return 'instruction'
  }
  return normalized
}

/** Wizard / display: coerce stored answer to Yes | No | NA | '' */
export function normalizeYesNoNaDisplay(val) {
  if (val == null) return ''
  const s = String(val).trim().toLowerCase()
  if (s === 'yes') return 'Yes'
  if (s === 'no') return 'No'
  if (s === 'na' || s === 'n/a') return 'NA'
  return ''
}
