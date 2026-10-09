/**
 * Human-readable Walkabout submit blockers and in-page scroll targets.
 */

export const WALKABOUT_FIELD_LABELS = {
  block_id: 'Location',
  template_id: 'Template',
  ew_q_responsible: 'Responsible officer',
  ew_q_role: 'Role',
  ew_q_area: 'Estate area',
  ew_q_planned_date: 'Inspection date',
  ew_st_caretaker_present: 'Caretaker present',
  ew_st_repairs_officer_present: 'Repairs officer present',
  ew_st_esm_present: 'ESM present',
  ew_st_ward_cllr_present: 'Ward councillor present',
  ew_st_repairs_officer_select: 'Repairs officer name',
  ew_ec_paving_grade: 'Paving / signage grade',
  ew_os_overall_grade: 'Overall cleanliness grade',
  ew_sig_signature: 'Signature',
  ew_sig_inspection_date: 'Date of inspection',
}

export function describeWalkaboutValidationErrors(errs = {}) {
  return Object.entries(errs).map(([key, message]) => {
    const label = WALKABOUT_FIELD_LABELS[key]
      || (String(key).startsWith('checklist') ? 'Additional items' : null)
    const detail = String(message || 'Required').trim()
    return label ? `${label}: ${detail}` : detail
  })
}

export function firstWalkaboutErrorField(errs = {}) {
  return Object.keys(errs)[0] || ''
}

export function walkaboutPendingPhotoMessage({ hasActiveUploads = false, hasPendingLocalUrls = false } = {}) {
  if (hasActiveUploads) {
    return 'Photographs are still uploading. Wait until they finish, then tap Save inspection. Your answers are still saved on this phone.'
  }
  if (hasPendingLocalUrls) {
    return 'Photographs have not finished uploading. Tap Retry upload when you have a connection, then tap Save inspection. Your answers are still saved on this phone.'
  }
  return ''
}

export function buildWalkaboutSubmitBlockedMessage(errs = {}, photoMessage = '') {
  const missing = describeWalkaboutValidationErrors(errs)
  const parts = []
  if (photoMessage) parts.push(photoMessage)
  if (missing.length) {
    parts.push(`This inspection cannot be submitted yet. Complete: ${missing.join('; ')}.`)
  }
  if (!parts.length) {
    return 'This inspection cannot be submitted yet. Complete the highlighted required fields, then tap Save inspection.'
  }
  return `${parts.join(' ')} Nothing has been submitted. Your work remains on this phone.`
}

export function scrollToWalkaboutField(fieldKey) {
  if (typeof document === 'undefined' || !fieldKey) return false
  const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(fieldKey) : fieldKey
  const el = document.querySelector(`[data-walkabout-field="${escaped}"]`)
  if (!el) return false
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  return true
}
