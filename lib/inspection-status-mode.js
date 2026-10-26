import { draftHasOfficerProgress } from '@/lib/offline-inspection-drafts'

export function resolveInspectionStatusMode({
  isOnline,
  activeDraftId,
  activeDraftPayload,
  submitSuccessMessage,
}) {
  if (submitSuccessMessage) return 'submitted'
  if (!isOnline) return 'offline'
  const hasActiveDraft =
    Boolean(activeDraftId) &&
    activeDraftPayload &&
    draftHasOfficerProgress(activeDraftPayload)
  if (hasActiveDraft) return 'online-draft'
  return 'hidden'
}

export function savedDraftsShouldRender(mode) {
  return mode === 'hidden' || mode === 'submitted' || mode === 'online-draft' || mode === 'offline'
}

/** Walkabout no longer lists saved drafts on the blank form. Other forms still can. */
export function walkaboutShowsSavedDraftsByDefault() {
  return false
}
