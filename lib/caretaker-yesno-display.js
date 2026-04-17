/**
 * Caretaker Yes/No UI: when to show comment/photo follow-ups (styling-only helpers; answers still driven by template flags).
 */
import { requiresCommentOnNo, requiresPhotoOnNo } from './yesno-action-handler'

export function normalizeWhenToken(v) {
  if (v == null || v === '') return ''
  return String(v).toLowerCase().trim().replace(/\s+/g, '_')
}

export function computeCaretakerRequiresComment({ isNo, isYes, shouldCreateAction, nCw, question, answer }) {
  const legacyNoBundle =
    isNo &&
    shouldCreateAction &&
    requiresCommentOnNo(question) &&
    (nCw === '' || nCw === 'on_no')

  return (
    (nCw === 'always' && answer != null) ||
    (nCw === 'on_no' && isNo) ||
    (nCw === 'on_yes' && isYes) ||
    legacyNoBundle
  )
}

export function computeCaretakerRequiresPhoto({ isNo, isYes, shouldCreateAction, nPw, question, answer }) {
  const legacyNoBundle =
    isNo &&
    shouldCreateAction &&
    requiresPhotoOnNo(question) &&
    (nPw === '' || nPw === 'on_no')

  return (
    (nPw === 'always' && answer != null) ||
    (nPw === 'on_no' && isNo) ||
    (nPw === 'on_yes' && isYes) ||
    legacyNoBundle
  )
}

/** Row labels A, B, … Z, AA, AB, … for caretaker checklist sections */
export function indexToCaretakerRowLetter(index) {
  if (index == null || index < 0) return 'A'
  let n = index
  let s = ''
  do {
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return s
}

export function stripLeadingRowEnumPrefix(label) {
  return String(label ?? '')
    .replace(/^\s*[A-Za-z]{1,3}\.\s+/, '')
    .replace(/^\s*\d+\.\s+/, '')
    .trim()
}

export function caretakerRowDisplayLabel(letter, question) {
  const base = stripLeadingRowEnumPrefix(question?.label || question?.question_text || '')
  const fallback = question?.id != null ? String(question.id) : ''
  return letter + '. ' + (base || fallback)
}
