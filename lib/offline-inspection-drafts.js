const STORAGE_KEY = 'croydon_inspection_offline_drafts_v1'

export const OFFLINE_DRAFT_STORAGE_FULL_MESSAGE =
  'Some photos may not have been saved because this phone is low on storage. Please reconnect and submit as soon as possible.'

function browserStorage() {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function createOfflineDraftId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `offline_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

export function readOfflineInspectionDrafts() {
  const storage = browserStorage()
  if (!storage) return []
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function writeOfflineInspectionDrafts(drafts) {
  const storage = browserStorage()
  if (!storage) return false
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(Array.isArray(drafts) ? drafts : []))
    return true
  } catch {
    return false
  }
}

export function upsertOfflineInspectionDraft(draft) {
  if (!draft?.id) {
    return { drafts: readOfflineInspectionDrafts(), saved: false }
  }
  try {
    const drafts = readOfflineInspectionDrafts()
    const now = new Date().toISOString()
    const nextDraft = {
      ...draft,
      createdAt: draft.createdAt || now,
      updatedAt: now,
      status: draft.status || 'unsent',
    }
    const idx = drafts.findIndex((item) => item.id === draft.id)
    const next = idx >= 0 ? drafts.map((item, i) => (i === idx ? nextDraft : item)) : [nextDraft, ...drafts]
    const saved = writeOfflineInspectionDrafts(next)
    return { drafts: saved ? next : readOfflineInspectionDrafts(), saved }
  } catch {
    return { drafts: readOfflineInspectionDrafts(), saved: false }
  }
}

export function removeOfflineInspectionDraft(id) {
  const next = readOfflineInspectionDrafts().filter((draft) => draft.id !== id)
  writeOfflineInspectionDrafts(next)
  return next
}

export function hasInspectionDraftContent(payload) {
  if (!payload || typeof payload !== 'object') return false
  const body = payload.submitBody || {}
  return Boolean(
    body.template_id ||
      body.block_id ||
      body.location ||
      body.description ||
      Object.keys(body.answers || {}).length ||
      Object.keys(body.answer_extras || {}).length
  )
}

const PHOTO_URL_KEYS = ['photo_urls', 'id_card_photo_urls', 'paper_form_photo_urls', 'photoUrls']

function collectPhotoUrlsFromExtras(extras) {
  if (!extras || typeof extras !== 'object') return []
  const urls = []
  for (const key of PHOTO_URL_KEYS) {
    const value = extras[key]
    if (Array.isArray(value)) {
      value.forEach((url) => {
        if (typeof url === 'string' && url.trim()) urls.push(url.trim())
      })
    } else if (typeof value === 'string' && value.trim()) {
      urls.push(value.trim())
    }
  }
  for (const [key, value] of Object.entries(extras)) {
    if (PHOTO_URL_KEYS.includes(key)) continue
    if (!key.includes('photo') || !Array.isArray(value)) continue
    value.forEach((url) => {
      if (typeof url === 'string' && url.trim()) urls.push(url.trim())
    })
  }
  return urls
}

export function collectPhotoUrlsFromDraftPayload(payload) {
  const body = payload?.submitBody || {}
  const answerExtras = body.answer_extras || {}
  const urls = []
  for (const extras of Object.values(answerExtras)) {
    urls.push(...collectPhotoUrlsFromExtras(extras))
  }
  return [...new Set(urls)]
}

function isLocalOnlyPhotoUrl(url) {
  return url.startsWith('blob:') || url.startsWith('data:')
}

export function isPendingLocalPhotoUrl(url) {
  return isLocalOnlyPhotoUrl(url)
}

export function getDraftPhotoStatus(payload) {
  const urls = collectPhotoUrlsFromDraftPayload(payload)
  if (urls.length === 0) {
    return { key: 'none', label: 'No photos added', pendingCount: 0, uploadedCount: 0, totalCount: 0 }
  }
  const pendingUrls = urls.filter(isLocalOnlyPhotoUrl)
  const uploadedCount = urls.length - pendingUrls.length

  if (pendingUrls.length > 0 && uploadedCount === 0) {
    const label =
      pendingUrls.length === 1
        ? 'Photo saved on this phone — waiting to upload'
        : `${pendingUrls.length} photos saved on this phone — waiting to upload`
    return {
      key: 'pending',
      label,
      pendingCount: pendingUrls.length,
      uploadedCount: 0,
      totalCount: urls.length,
    }
  }
  if (pendingUrls.length > 0) {
    return {
      key: 'mixed',
      label: `${pendingUrls.length} photo${pendingUrls.length === 1 ? '' : 's'} saved on this phone — waiting to upload`,
      pendingCount: pendingUrls.length,
      uploadedCount,
      totalCount: urls.length,
    }
  }
  const label = urls.length === 1 ? '1 photo uploaded' : `${urls.length} photos uploaded`
  return { key: 'uploaded', label, pendingCount: 0, uploadedCount: urls.length, totalCount: urls.length }
}

export function getDraftConnectionStatus({ isOnline, draftStatus, hasAnswers = false, hasPendingPhotos = false }) {
  if (draftStatus === 'submitted') {
    return { key: 'submitted', label: 'Inspection submitted successfully' }
  }
  if (!isOnline) {
    if (hasPendingPhotos) {
      return { key: 'upload-waiting', label: 'Waiting for internet connection to complete upload' }
    }
    return hasAnswers
      ? { key: 'ready-when-online', label: 'Ready to submit when signal returns' }
      : { key: 'waiting', label: 'Waiting for internet connection' }
  }
  if (hasPendingPhotos) {
    return { key: 'upload-waiting', label: 'Waiting for internet connection to complete upload' }
  }
  return { key: 'ready', label: 'Ready to submit' }
}

export function getDraftNextStep({ isOnline, photoStatusKey }) {
  if (photoStatusKey === 'pending' || photoStatusKey === 'mixed') {
    if (!isOnline) {
      return 'You can continue working. Photos will upload when signal returns.'
    }
    return 'Photos will upload when your connection is stable, then submit this inspection.'
  }
  if (!isOnline) {
    return 'You can continue working. Submit when signal returns.'
  }
  return 'Check everything looks correct, then tap Submit inspection.'
}

export function formatDraftLastSaved(draft) {
  const timestamp = draft?.updatedAt || draft?.createdAt
  if (!timestamp) return null
  return new Date(timestamp).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
}

export function getOfflineDraftStatusSummary(draft, isOnline) {
  const payload = draft?.payload || {}
  const answersSaved = hasInspectionDraftContent({ submitBody: payload.submitBody || {} })
  const photoStatus = getDraftPhotoStatus(payload)
  const connectionStatus = getDraftConnectionStatus({
    isOnline,
    draftStatus: draft?.status,
    hasAnswers: answersSaved,
    hasPendingPhotos: photoStatus.pendingCount > 0,
  })
  return {
    label: draft?.label || payload.templateName || payload.formType || 'Inspection',
    answersSaved,
    answersLabel: answersSaved ? 'Answers saved on this phone' : 'No answers saved yet',
    photoStatus,
    connectionStatus,
    lastSavedAt: formatDraftLastSaved(draft),
    nextStep: getDraftNextStep({ isOnline, photoStatusKey: photoStatus.key }),
  }
}
