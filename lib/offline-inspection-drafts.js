const STORAGE_KEY = 'croydon_inspection_offline_drafts_v1'

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
  if (!storage) return
  storage.setItem(STORAGE_KEY, JSON.stringify(Array.isArray(drafts) ? drafts : []))
}

export function upsertOfflineInspectionDraft(draft) {
  if (!draft?.id) return []
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
  writeOfflineInspectionDrafts(next)
  return next
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

export function getDraftPhotoStatus(payload) {
  const urls = collectPhotoUrlsFromDraftPayload(payload)
  if (urls.length === 0) {
    return { key: 'none', label: 'No photos added' }
  }
  const pendingUrls = urls.filter(isLocalOnlyPhotoUrl)
  if (pendingUrls.length > 0) {
    return {
      key: 'pending',
      label: 'Photos still waiting to upload',
      pendingCount: pendingUrls.length,
      totalCount: urls.length,
    }
  }
  const countLabel = urls.length === 1 ? '1 photo saved on this phone' : `${urls.length} photos saved on this phone`
  return { key: 'saved', label: countLabel, totalCount: urls.length }
}

export function getDraftConnectionStatus({ isOnline, draftStatus, hasAnswers = false }) {
  if (draftStatus === 'submitted') {
    return { key: 'submitted', label: 'Inspection submitted successfully' }
  }
  if (!isOnline) {
    return hasAnswers
      ? { key: 'ready-when-online', label: 'Ready to submit when signal returns' }
      : { key: 'waiting', label: 'Waiting for internet connection' }
  }
  return { key: 'ready', label: 'Ready to submit' }
}

export function getDraftNextStep({ isOnline, photoStatusKey }) {
  if (!isOnline) {
    if (photoStatusKey === 'pending') {
      return 'Reconnect to upload photos and submit this inspection.'
    }
    if (photoStatusKey === 'none') {
      return 'Keep filling in answers. To add photos, reconnect to the internet. Submit when you are back online.'
    }
    return 'Review your answers. Reconnect to submit this inspection to the council system.'
  }
  if (photoStatusKey === 'pending') {
    return 'Finish uploading photos, then submit this inspection.'
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
