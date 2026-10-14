/**
 * Walkabout session rules: new inspection vs Resume vs camera reload vs submit.
 * Pure helpers — no localStorage writes.
 */

export const WALKABOUT_NEXT_BLOCK_SESSION_KEY = 'estate_walkabout_start_next_block_v1'

/**
 * Resume is explicit: the officer tapped Resume or opened a URL with draft_id.
 * A leftover active draft id must never fill a brand-new inspection.
 */
export function walkaboutShouldRestoreOnMount({
  urlDraftId = '',
  initialDraftId = '',
  submitCompleted = false,
} = {}) {
  if (submitCompleted) return false
  return Boolean(String(urlDraftId || '').trim() || String(initialDraftId || '').trim())
}

/**
 * Camera/process-death reload may restore only the in-progress draft already
 * attached to this form, never a different remembered id.
 */
export function walkaboutShouldRestoreAfterReload({
  currentDraftId = '',
  candidateDraftId = '',
  submitCompleted = false,
} = {}) {
  if (submitCompleted) return false
  const current = String(currentDraftId || '').trim()
  const candidate = String(candidateDraftId || '').trim()
  return Boolean(current && candidate && current === candidate)
}

export function walkaboutShouldAutosaveDraft({
  submitCompleted = false,
  submittedInspectionId = '',
  suppressUntilEdit = false,
  hasOfficerProgress = false,
} = {}) {
  if (submitCompleted || submittedInspectionId) return false
  if (suppressUntilEdit) return false
  return Boolean(hasOfficerProgress)
}

export function shouldFlushWalkaboutDraftBeforeCamera({ submitCompleted = false } = {}) {
  return !submitCompleted
}

export function resolveWalkaboutClientInspectionId({
  existingDraftId = '',
  inFlightId = '',
  createId,
} = {}) {
  const inFlight = String(inFlightId || '').trim()
  if (inFlight) return inFlight
  const existing = String(existingDraftId || '').trim()
  if (existing) return existing
  if (typeof createId === 'function') return String(createId() || '').trim()
  return ''
}

export function walkaboutShouldBeginSubmit({
  submitCompleted = false,
  inFlight = false,
  hasActivePhotoUploads = false,
} = {}) {
  if (submitCompleted || inFlight || hasActivePhotoUploads) return false
  return true
}

export function walkaboutSubmitButtonLabel({
  isSubmitting = false,
  isOnline = true,
  hasActivePhotoUploads = false,
} = {}) {
  if (hasActivePhotoUploads) return 'Waiting for photos…'
  if (isSubmitting) return 'Submitting…'
  if (!isOnline) return 'Save draft on this phone'
  return 'Submit inspection'
}

export function walkaboutInterruptedSubmitMessage({
  draftCreatedOnServer = false,
  locallySaved = false,
} = {}) {
  if (draftCreatedOnServer) {
    return 'Connection was interrupted after this inspection was saved on the server as a draft. It has not been submitted yet. Tap Submit again — the same record will be used so a duplicate is not created.'
  }
  if (locallySaved) {
    return 'Connection was lost. This inspection has been saved as a draft on this phone. It has not been submitted.'
  }
  return 'Connection was lost. This inspection has not been submitted.'
}

export function alreadySubmittedInspectionReplay(inspection) {
  const status = String(inspection?.status || '').toLowerCase().trim()
  if (status !== 'submitted') return null
  return {
    alreadySubmitted: true,
    inspectionId: inspection?.id || null,
  }
}

export function walkaboutHref({ templateId = '', draftId = '' } = {}) {
  const params = new URLSearchParams()
  if (templateId) params.set('template_id', String(templateId))
  const id = String(draftId || '').trim()
  if (id) params.set('draft_id', id)
  const query = params.toString()
  return query ? `/inspections/new?${query}` : '/inspections/new'
}

export function withWalkaboutDraftIdQuery(search, draftId) {
  const raw = String(search || '')
  const params = new URLSearchParams(raw.startsWith('?') ? raw.slice(1) : raw)
  const id = String(draftId || '').trim()
  if (!id) params.delete('draft_id')
  else params.set('draft_id', id)
  const query = params.toString()
  return query ? `?${query}` : ''
}

export function syncWalkaboutDraftIdInUrl(draftId) {
  if (typeof window === 'undefined' || !window.history?.replaceState) return
  try {
    const url = new URL(window.location.href)
    const nextSearch = withWalkaboutDraftIdQuery(url.search, draftId)
    if (url.search === nextSearch) return
    url.search = nextSearch
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
  } catch {
    /* ignore */
  }
}

export function writeWalkaboutNextBlockFlag() {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(WALKABOUT_NEXT_BLOCK_SESSION_KEY, '1')
  } catch {
    /* ignore */
  }
}

export function consumeWalkaboutNextBlockCarryOver(readCarryOver) {
  if (typeof window === 'undefined') return {}
  try {
    const flagged = window.sessionStorage.getItem(WALKABOUT_NEXT_BLOCK_SESSION_KEY) === '1'
    window.sessionStorage.removeItem(WALKABOUT_NEXT_BLOCK_SESSION_KEY)
    if (!flagged || typeof readCarryOver !== 'function') return {}
    const carried = readCarryOver()
    return carried && typeof carried === 'object' ? carried : {}
  } catch {
    return {}
  }
}

export function walkaboutNewFormShouldBeBlank({ isExplicitResume = false } = {}) {
  return !isExplicitResume
}
