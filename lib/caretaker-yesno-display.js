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
