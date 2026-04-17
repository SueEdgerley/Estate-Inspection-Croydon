/**
 * Pack structured NV wizard fields (comments, photos, Q24 Y/N, sign-off, estate rows) into inspection_answers.notes.
 * Plain-text legacy notes remain readable when not prefixed.
 */

const PREFIX = '__NV_JSON__V1__'

/**
 * @param {Record<string, unknown>} extrasObj
 * @returns {string | null}
 */
export function packNvWizardExtras(extrasObj) {
  if (!extrasObj || typeof extrasObj !== 'object') return null
  const cleaned = { ...extrasObj }
  const keys = Object.keys(cleaned).filter((k) => {
    const v = cleaned[k]
    if (v === undefined || v === null) return false
    if (typeof v === 'string' && !v.trim()) return false
    if (Array.isArray(v) && v.length === 0) return false
    if (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0) return false
    return true
  })
  if (!keys.length) return null
  return PREFIX + JSON.stringify(cleaned)
}

/**
 * @param {string | null | undefined} notes
 * @returns {{ structured: Record<string, unknown>, plainComment: string }}
 */
export function unpackNvWizardNotes(notes) {
  if (!notes || typeof notes !== 'string') return { structured: {}, plainComment: '' }
  if (notes.startsWith(PREFIX)) {
    try {
      const structured = JSON.parse(notes.slice(PREFIX.length))
      if (!structured || typeof structured !== 'object') return { structured: {}, plainComment: '' }
      const plainComment = typeof structured.comment === 'string' ? structured.comment : ''
      return { structured, plainComment }
    } catch {
      return { structured: {}, plainComment: notes }
    }
  }
  return { structured: {}, plainComment: notes }
}

/**
 * Merge server notes + optional extras patch into a single packed notes string (or plain comment).
 * @param {string | null | undefined} existingNotes
 * @param {Record<string, unknown>} patch
 */
export function mergeNvNotes(existingNotes, patch) {
  const { structured, plainComment } = unpackNvWizardNotes(existingNotes)
  const merged = { ...structured, ...patch }
  if (merged.comment === undefined || merged.comment === '') {
    if (plainComment && !structured.comment) merged.comment = plainComment
  }
  const packed = packNvWizardExtras(merged)
  if (packed) return packed
  if (typeof merged.comment === 'string' && merged.comment.trim()) return merged.comment.trim()
  return existingNotes || null
}
