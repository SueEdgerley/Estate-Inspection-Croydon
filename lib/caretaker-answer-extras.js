import { unpackNvWizardNotes } from '@/lib/nv-notes-pack'

/**
 * Parse packed NV-style notes (or plain text) from inspection_answers.notes for caretaker routing.
 * @param {string | null | undefined} notes
 */
export function parseCaretakerAnswerNotes(notes) {
  const { structured, plainComment } = unpackNvWizardNotes(notes)
  const sc = structured && typeof structured === 'object' ? structured : {}
  const fromStructured =
    typeof sc.comment === 'string' && sc.comment.trim() ? sc.comment.trim() : ''
  const comment = fromStructured || (plainComment && String(plainComment).trim()) || ''

  let recipient_person_id = null
  if (typeof sc.recipient_person_id === 'string' && sc.recipient_person_id.trim()) {
    recipient_person_id = sc.recipient_person_id.trim()
  }

  let costCode = null
  if (typeof sc.cost_code === 'string' && sc.cost_code.trim()) costCode = sc.cost_code.trim()
  else if (typeof sc.costCode === 'string' && sc.costCode.trim()) costCode = sc.costCode.trim()

  let priority = null
  if (typeof sc.priority === 'string' && sc.priority.trim()) priority = sc.priority.trim()

  const extraPhotoUrls = Array.isArray(sc.photo_urls)
    ? sc.photo_urls.filter((u) => typeof u === 'string' && u.trim())
    : []

  return {
    comment,
    recipient_person_id,
    costCode,
    priority,
    raiseIssue: sc.raise_issue === true,
    extraPhotoUrls,
    structured: sc,
  }
}
