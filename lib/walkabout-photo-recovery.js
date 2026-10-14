/**
 * Camera interrupt, reload and failed-upload policy for Walkabout photographs.
 *
 * Android Edge often backgrounds or kills the tab when the system camera opens.
 * Answers must already be on disk before that happens. Photo bytes must be
 * stored as durable URLs (data: or https) before a network upload is attempted,
 * because blob: URLs and in-flight File objects do not survive a reload.
 */

import { isPendingLocalPhotoUrl } from '@/lib/offline-photo-upload'
import { draftHasOfficerProgress } from '@/lib/offline-inspection-drafts'

/** Events that must flush the draft before/while the camera takes the foreground. */
export const WALKABOUT_CAMERA_FLUSH_EVENTS = ['pagehide', 'visibilitychange']

export function isDurablePhotoUrl(url) {
  if (typeof url !== 'string' || !url.trim()) return false
  if (url.startsWith('blob:')) return false
  if (url.startsWith('data:')) return true
  return /^https?:\/\//i.test(url.trim())
}

export function sanitizeRestoredPhotoUrls(urls = []) {
  const list = Array.isArray(urls)
    ? urls
    : typeof urls === 'string' && urls.trim()
      ? [urls]
      : []
  return list.filter(isDurablePhotoUrl)
}

export function photosLostOnReload(urls = []) {
  return (Array.isArray(urls) ? urls : []).filter(
    (url) => typeof url === 'string' && url.startsWith('blob:')
  )
}

/**
 * Opening the Android camera can reload Edge. Flush answers first; do not wait
 * for the photograph to return.
 */
export function shouldFlushDraftBeforeCameraOpen({ submitCompleted = false } = {}) {
  return !submitCompleted
}

/**
 * Persist compressed bytes locally (data URL) before POST /api/upload/photo so a
 * dropped connection or tab kill cannot lose the only copy.
 */
export function shouldPersistPhotoLocallyBeforeUpload() {
  return true
}

export function replacePhotoUrl(urls, previousUrl, nextUrl) {
  const list = Array.isArray(urls) ? [...urls] : []
  if (!previousUrl || !nextUrl) return list
  return list.map((url) => (url === previousUrl ? nextUrl : url))
}

export function appendPhotoUrl(urls, url) {
  const list = Array.isArray(urls) ? [...urls] : []
  if (!url || list.includes(url)) return list
  list.push(url)
  return list
}

/**
 * After a failed upload the local data URL must remain so Retry can run.
 */
export function urlsAfterFailedPhotoUpload(currentUrls, localDataUrl) {
  return appendPhotoUrl(currentUrls, localDataUrl)
}

export function failedPhotoUploadBlocksSubmit({ hasActiveUploads = false, pendingLocalUrls = [] } = {}) {
  if (hasActiveUploads) return true
  return (pendingLocalUrls || []).some(isPendingLocalPhotoUrl)
}

export function shouldShowPhotoRetryButton({ uploading = false, pendingLocalUrls = [] } = {}) {
  if (uploading) return false
  return (pendingLocalUrls || []).some(isPendingLocalPhotoUrl)
}

/**
 * After a full page reload, restore the remembered draft (same id) when it
 * still has officer progress. Empty twins at the same timestamp are ignored.
 */
export function resolveDraftToRestoreAfterReload({ drafts = [], activeDraftId = '' } = {}) {
  const id = String(activeDraftId || '').trim()
  if (!id) return null
  const draft = (Array.isArray(drafts) ? drafts : []).find((item) => item?.id === id)
  if (!draft) return null
  if (!draftHasOfficerProgress(draft.payload || {})) return null
  return draft
}

export function restoredDraftKeepsAnswersAndPhotos(draft) {
  if (!draft) return false
  const body = draft.payload?.submitBody || {}
  const answers = body.answers && typeof body.answers === 'object' ? body.answers : {}
  const extras = body.answer_extras && typeof body.answer_extras === 'object' ? body.answer_extras : {}
  const photoUrls = Object.values(extras).flatMap((ex) =>
    Array.isArray(ex?.photo_urls) ? ex.photo_urls : []
  )
  const durablePhotos = sanitizeRestoredPhotoUrls(photoUrls)
  const filled = Object.values(answers).some((value) => String(value || '').trim() && String(value).trim() !== '[]')
  return filled && durablePhotos.length === photoUrls.filter(Boolean).length
}
