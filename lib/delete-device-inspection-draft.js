import {
  clearActiveOfflineDraftId,
  formatSavedDraftIdentity,
  readActiveOfflineDraftId,
  readOfflineInspectionDrafts,
  removeOfflineInspectionDraft,
  summarizeOfflineDraft,
} from './offline-inspection-drafts.js'
import { clearInspectionResumeDraft, readInspectionResumeDraft } from './inspection-resume-draft.js'

/**
 * Remove one device draft. Other drafts stay in local storage.
 * The single-slot resume draft is cleared only when it is this draft,
 * or when the caller is deleting the draft currently open on the form.
 */
export function deleteDeviceInspectionDraft(id, { forceClearResume = false } = {}) {
  const draftId = String(id || '').trim()
  const before = readOfflineInspectionDrafts()
  if (!draftId) {
    return { drafts: before, removed: false, clearedResume: false, clearedActive: false }
  }
  const removed = before.some((draft) => String(draft?.id || '') === draftId)
  const drafts = removeOfflineInspectionDraft(draftId)
  const resume = readInspectionResumeDraft()
  const resumeId = String(resume?.payload?.offlineDraftId || '').trim()
  const clearedResume =
    Boolean(resume) && (resumeId === draftId || (forceClearResume && !resumeId))
  if (clearedResume) clearInspectionResumeDraft()
  const clearedActive = readActiveOfflineDraftId() === draftId
  if (clearedActive) clearActiveOfflineDraftId()
  return { drafts, removed, clearedResume, clearedActive }
}

export function describeDeviceDraftForDelete(draft, { blocks = [] } = {}) {
  const summary = summarizeOfflineDraft(draft, { blocks })
  const identity = formatSavedDraftIdentity(summary)
  return {
    formName: summary.label || 'Inspection',
    location: identity.location || 'Location not recorded',
    lastSaved: summary.lastSavedAt || 'Date not recorded',
  }
}

/**
 * Hold values:
 * - 'until-blank': the open draft was just deleted; ignore the payload still on screen
 * - 'until-edit': the form is blank; keep it blank until the officer enters something new
 * - false: autosave may run
 */
export function nextDraftAutosaveHold(hold, hasOfficerProgress) {
  if (hold === 'until-blank') return hasOfficerProgress ? 'until-blank' : 'until-edit'
  if (hold === 'until-edit') return hasOfficerProgress ? false : 'until-edit'
  return false
}

export function cancelledStaleDraftWrite(scheduledGeneration, currentGeneration) {
  return scheduledGeneration !== currentGeneration
}
