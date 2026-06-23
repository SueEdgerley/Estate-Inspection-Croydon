import {
  createOfflineDraftId,
  hasInspectionDraftContent,
  upsertOfflineInspectionDraft,
} from '@/lib/offline-inspection-drafts'
import {
  resumeDraftHasMeaningfulContent,
  writeInspectionResumeDraft,
} from '@/lib/inspection-resume-draft'

/**
 * Merge photo URL updates into submitBody.answer_extras[questionId].
 * @param {Record<string, unknown>} submitBody
 * @param {string} questionId
 * @param {Record<string, unknown>} patch
 */
export function mergeAnswerExtrasPatch(submitBody, questionId, patch) {
  if (!submitBody || typeof submitBody !== 'object') return submitBody
  return {
    ...submitBody,
    answer_extras: {
      ...(submitBody.answer_extras || {}),
      [questionId]: {
        ...((submitBody.answer_extras || {})[questionId] || {}),
        ...patch,
      },
    },
  }
}

/**
 * Merge photo URLs stored on inspection_answers (photo question type).
 * @param {Record<string, unknown>} submitBody
 * @param {string} questionId
 * @param {string[]} urls
 */
export function mergeAnswerQuestionPhotoUrls(submitBody, questionId, urls) {
  if (!submitBody || typeof submitBody !== 'object') return submitBody
  const arr = Array.isArray(urls) ? urls.filter((u) => typeof u === 'string' && u) : []
  return {
    ...submitBody,
    answers: {
      ...(submitBody.answers || {}),
      [questionId]: arr.length ? JSON.stringify(arr) : '',
    },
  }
}

/**
 * Merge a checklist row photo update for estate walkabout drafts.
 * @param {Record<string, unknown>} submitBody
 * @param {string} checklistQuestionId
 * @param {string} itemId
 * @param {string[]} urls
 */
export function mergeWalkaboutChecklistItemPhotoUrls(submitBody, checklistQuestionId, itemId, urls) {
  if (!submitBody || typeof submitBody !== 'object') return submitBody
  const answers = { ...(submitBody.answers || {}) }
  let checklist = []
  try {
    checklist = JSON.parse(answers[checklistQuestionId] || '[]')
  } catch {
    checklist = []
  }
  if (!Array.isArray(checklist)) checklist = []
  const nextChecklist = checklist.map((item) =>
    item?.id === itemId ? { ...item, photo_urls: urls } : item
  )
  return {
    ...submitBody,
    answers: {
      ...answers,
      [checklistQuestionId]: JSON.stringify(nextChecklist),
    },
  }
}

/**
 * Immediately persist the current draft payload to localStorage (resume + offline draft stores).
 * @param {{
 *   payload: Record<string, unknown>,
 *   offlineDraftId?: string,
 *   locationLabel?: string,
 * }} options
 */
export function flushInspectionDraftPayloadToLocalStorage({ payload, offlineDraftId, locationLabel }) {
  if (!payload || typeof payload !== 'object') {
    return { saved: false, offlineDraftId: offlineDraftId || '', drafts: [] }
  }

  const resolvedOfflineDraftId = offlineDraftId || createOfflineDraftId()
  const flushPayload = {
    ...payload,
    locationLabel: locationLabel || payload.locationLabel || payload.location || '',
    offlineDraftId: resolvedOfflineDraftId,
  }

  let resumeSaved = true
  let offlineSaved = true
  let drafts = []

  try {
    if (resumeDraftHasMeaningfulContent(flushPayload)) {
      resumeSaved = writeInspectionResumeDraft(flushPayload)
    }
    if (hasInspectionDraftContent({ submitBody: flushPayload.submitBody || {} })) {
      const result = upsertOfflineInspectionDraft({
        id: resolvedOfflineDraftId,
        label: flushPayload.templateName || flushPayload.formType || 'Inspection',
        payload: flushPayload,
      })
      offlineSaved = result.saved
      drafts = result.drafts
    }
  } catch {
    resumeSaved = false
    offlineSaved = false
  }

  return {
    saved: resumeSaved && offlineSaved,
    offlineDraftId: resolvedOfflineDraftId,
    drafts,
  }
}
