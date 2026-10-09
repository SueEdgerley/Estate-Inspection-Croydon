/**
 * Map a saved Walkabout offline draft onto form state.
 * Pure: does not read or write localStorage, submit, or delete drafts.
 */

import { capActionPhotoUrls } from '@/lib/action-photos'
import {
  ESTATE_WALKABOUT_CHECKLIST_QID,
  ESTATE_WALKABOUT_TEMPLATE_ID,
} from '@/lib/estate-walkabout-template'
import {
  getDraftDisplayLocation,
  getDraftTemplateId,
  summarizeOfflineDraft,
} from '@/lib/offline-inspection-drafts'
import { sanitizeRestoredPhotoUrls } from '@/lib/walkabout-photo-recovery'

export function isWalkaboutOfflineDraft(draft) {
  const templateId = getDraftTemplateId(draft)
  if (templateId === ESTATE_WALKABOUT_TEMPLATE_ID) return true
  const name = String(
    draft?.label || draft?.payload?.templateName || draft?.payload?.formType || ''
  )
    .toLowerCase()
    .trim()
  return name === 'estate walkabout' || name.includes('estate walkabout')
}

/**
 * Parent NewInspectionForm unmounts itself when the template becomes Walkabout.
 * Resume must hand the list draft to the child — applying it on the parent is discarded.
 */
export function walkaboutResumeMustPassDraftToChild(draft) {
  return isWalkaboutOfflineDraft(draft)
}

export function normalizeRestoredWalkaboutExtras(answerExtras) {
  const restoredExtras = answerExtras && typeof answerExtras === 'object' ? answerExtras : {}
  const normalized = {}
  for (const [qid, extra] of Object.entries(restoredExtras)) {
    if (!extra || typeof extra !== 'object') continue
    normalized[qid] = {
      ...extra,
      photo_urls: capActionPhotoUrls(
        sanitizeRestoredPhotoUrls(extra.photo_urls || extra.photoUrl || extra.photoUrls)
      ),
    }
  }
  return normalized
}

export function parseWalkaboutChecklistFromAnswers(answers) {
  const raw = answers?.[ESTATE_WALKABOUT_CHECKLIST_QID]
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/**
 * @returns {null | {
 *   id: string,
 *   postgresBlockId: string,
 *   location: string,
 *   description: string,
 *   inspectionStartTime: string,
 *   inspectionEndTime: string,
 *   answers: Record<string, unknown>,
 *   answerExtras: Record<string, unknown>,
 *   checklist: unknown[],
 *   filledAnswerCount: number,
 *   photoCount: number,
 *   locationLabel: string,
 * }}
 */
export function buildWalkaboutFormStateFromDraft(draft, { blocks = [] } = {}) {
  if (!draft?.id) return null
  const payload = draft.payload && typeof draft.payload === 'object' ? draft.payload : {}
  const body = payload.submitBody && typeof payload.submitBody === 'object' ? payload.submitBody : {}
  const restoredAnswers = { ...(body.answers && typeof body.answers === 'object' ? body.answers : {}) }
  const checklist = parseWalkaboutChecklistFromAnswers(restoredAnswers)
  delete restoredAnswers[ESTATE_WALKABOUT_CHECKLIST_QID]
  const answerExtras = normalizeRestoredWalkaboutExtras(body.answer_extras)
  const summary = summarizeOfflineDraft(draft, { blocks })
  return {
    id: String(draft.id),
    postgresBlockId: String(body.block_id || payload.blockId || '').trim(),
    location: String(body.location || payload.location || '').trim(),
    description: String(body.description || payload.description || '').trim(),
    inspectionStartTime: body.inspection_start_time || payload.inspectionStartTime || '',
    inspectionEndTime: body.inspection_end_time || payload.inspectionEndTime || '',
    answers: restoredAnswers,
    answerExtras,
    checklist,
    filledAnswerCount: summary.filledAnswerCount,
    photoCount: summary.photoCount,
    locationLabel: summary.location || getDraftDisplayLocation(draft, blocks) || '',
  }
}

export function formatRestoredWalkaboutBanner({
  locationLabel = '',
  filledAnswerCount = 0,
  photoCount = 0,
} = {}) {
  const where = String(locationLabel || '').trim() || 'saved Walkabout'
  const answers = `${filledAnswerCount} answer${filledAnswerCount === 1 ? '' : 's'}`
  const photos = `${photoCount} photograph${photoCount === 1 ? '' : 's'}`
  return `Restored ${where}. ${answers} and ${photos} loaded from this phone.`
}

/**
 * After Resume, do not rebuild and write the payload until the officer edits.
 * Rebuilt submit bodies can drop extra keys and rewrite timestamps.
 */
export function shouldWriteWalkaboutDraftAfterRestore({ restoredUnedited = false, officerEdited = false } = {}) {
  if (officerEdited) return true
  if (restoredUnedited) return false
  return true
}
