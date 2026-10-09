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
    const idx = drafts.findIndex((item) => item.id === draft.id)
    const existing = idx >= 0 ? drafts[idx] : null
    if (draftHasOfficerProgress(existing?.payload) && !draftHasOfficerProgress(draft.payload)) {
      return { drafts, saved: true, skippedBlankOverwrite: true }
    }
    const nextDraft = {
      ...existing,
      ...draft,
      id: existing?.id || draft.id,
      createdAt: draft.createdAt || existing?.createdAt || now,
      updatedAt: now,
      status: draft.status || existing?.status || 'unsent',
    }
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

function isBlankDraftValue(value) {
  if (value == null) return true
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  if (!trimmed || trimmed === '[]' || trimmed === '{}') return true
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) {
        return parsed.every((item) => {
          if (item == null) return true
          if (typeof item === 'string') return !item.trim()
          if (typeof item !== 'object') return false
          const urls = collectPhotoUrlsFromExtras(item)
          return (
            !String(item.description || '').trim() &&
            !item.action_required &&
            !String(item.action_summary || '').trim() &&
            urls.length === 0
          )
        })
      }
      if (parsed && typeof parsed === 'object') return Object.keys(parsed).length === 0
    } catch {
      return false
    }
  }
  return false
}

/**
 * True when an officer has entered recoverable work — not just a selected
 * template or empty Walkabout answer keys. Used so opening the form does not
 * create a new blank draft that could hide an existing inspection.
 */
export function draftHasOfficerProgress(payload) {
  if (!payload || typeof payload !== 'object') return false
  const body = payload.submitBody || payload
  if (!body || typeof body !== 'object') return false
  if (String(body.block_id || payload.blockId || '').trim()) return true
  if (String(body.location || payload.location || payload.locationLabel || '').trim()) return true
  if (String(body.description || payload.description || '').trim()) return true
  if (collectPhotoUrlsFromDraftPayload({ submitBody: body, ...payload }).length > 0) return true
  const extras = body.answer_extras
  if (extras && typeof extras === 'object') {
    for (const value of Object.values(extras)) {
      if (!value || typeof value !== 'object') continue
      if (collectPhotoUrlsFromExtras(value).length > 0) return true
      for (const [key, extraValue] of Object.entries(value)) {
        if (key.includes('photo')) continue
        if (!isBlankDraftValue(extraValue)) return true
      }
    }
  }
  const answers = body.answers || {}
  for (const value of Object.values(answers)) {
    if (!isBlankDraftValue(value)) return true
  }
  return false
}

export function getDraftTemplateId(draft) {
  const payload = draft?.payload || {}
  return String(payload.submitBody?.template_id || payload.templateId || '').trim()
}

export function getDraftBlockId(draft) {
  const payload = draft?.payload || {}
  return String(payload.submitBody?.block_id || payload.blockId || '').trim()
}

export function getDraftDisplayLocation(draft, blocks = []) {
  const payload = draft?.payload || {}
  const explicit = String(
    payload.locationLabel || payload.submitBody?.location || payload.location || ''
  ).trim()
  if (explicit) return explicit
  const blockId = getDraftBlockId(draft)
  if (!blockId || !Array.isArray(blocks)) return ''
  const block = blocks.find((item) => String(item?.id || '') === blockId)
  return String(block?.name || block?.label || '').trim()
}

export function getInspectionDraftResumeHref(draft) {
  const templateId = getDraftTemplateId(draft)
  const label = String(draft?.label || draft?.payload?.templateName || '').toLowerCase()
  const walkabout =
    templateId === 'tpl_estate_walkabout_v1' || label.includes('estate walkabout') || !templateId
  const resumeTemplateId = walkabout ? templateId || 'tpl_estate_walkabout_v1' : templateId
  if (!resumeTemplateId) return '/inspections/new'
  return `/inspections/new?template_id=${encodeURIComponent(resumeTemplateId)}`
}

export const ACTIVE_OFFLINE_DRAFT_SESSION_KEY = 'croydon_inspection_active_offline_draft_id_v1'
/** Survives Android camera process-death that can wipe sessionStorage. */
export const ACTIVE_OFFLINE_DRAFT_LOCAL_KEY = 'croydon_inspection_active_offline_draft_id_local_v1'

function browserSessionStorage() {
  if (typeof window === 'undefined') return null
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

function writeActiveDraftId(storage, key, id) {
  if (!storage || !id) return
  try {
    storage.setItem(key, String(id))
  } catch {
    /* ignore quota errors */
  }
}

function readStorageId(storage, key) {
  if (!storage) return ''
  try {
    return String(storage.getItem(key) || '').trim()
  } catch {
    return ''
  }
}

function removeStorageId(storage, key) {
  if (!storage) return
  try {
    storage.removeItem(key)
  } catch {
    /* ignore */
  }
}

export function rememberActiveOfflineDraftId(id) {
  const value = String(id || '').trim()
  if (!value) return
  writeActiveDraftId(browserSessionStorage(), ACTIVE_OFFLINE_DRAFT_SESSION_KEY, value)
  writeActiveDraftId(browserStorage(), ACTIVE_OFFLINE_DRAFT_LOCAL_KEY, value)
}

export function readActiveOfflineDraftId() {
  const fromSession = readStorageId(browserSessionStorage(), ACTIVE_OFFLINE_DRAFT_SESSION_KEY)
  if (fromSession) return fromSession
  return readStorageId(browserStorage(), ACTIVE_OFFLINE_DRAFT_LOCAL_KEY)
}

export function clearActiveOfflineDraftId() {
  removeStorageId(browserSessionStorage(), ACTIVE_OFFLINE_DRAFT_SESSION_KEY)
  removeStorageId(browserStorage(), ACTIVE_OFFLINE_DRAFT_LOCAL_KEY)
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

function collectPhotoUrlsFromAnswerValue(value) {
  if (typeof value !== 'string' || !value.trim()) return []
  const trimmed = value.trim()
  if (!trimmed.startsWith('[') && !trimmed.startsWith('{')) return []
  try {
    const parsed = JSON.parse(trimmed)
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) {
      return parsed.map((url) => url.trim()).filter(Boolean)
    }
    if (Array.isArray(parsed)) {
      const urls = []
      for (const item of parsed) {
        if (item && typeof item === 'object') urls.push(...collectPhotoUrlsFromExtras(item))
      }
      return urls
    }
  } catch {
    return []
  }
  return []
}

export function collectPhotoUrlsFromDraftPayload(payload) {
  const body = payload?.submitBody || payload || {}
  const answerExtras = body.answer_extras || {}
  const urls = []
  for (const extras of Object.values(answerExtras)) {
    urls.push(...collectPhotoUrlsFromExtras(extras))
  }
  const answers = body.answers || {}
  for (const value of Object.values(answers)) {
    urls.push(...collectPhotoUrlsFromAnswerValue(value))
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

function filledAnswerCount(answers) {
  if (!answers || typeof answers !== 'object') return 0
  let count = 0
  for (const value of Object.values(answers)) {
    if (!isBlankDraftValue(value)) count += 1
  }
  return count
}

/**
 * Read-only summary for backup/export screens. Does not write storage.
 */
export function summarizeOfflineDraft(draft, { blocks = [] } = {}) {
  const payload = draft?.payload || {}
  const location = getDraftDisplayLocation(draft, blocks)
  const blockId = getDraftBlockId(draft)
  const photos = collectPhotoUrlsFromDraftPayload(payload)
  const startedAt = payload.submitBody?.inspection_start_time || payload.inspectionStartTime || null
  const haystack = [location, payload.location, payload.locationLabel, payload.submitBody?.location, draft?.label]
    .filter(Boolean)
    .join(' ')
  return {
    id: draft?.id || '',
    label: draft?.label || payload.templateName || payload.formType || 'Inspection',
    createdAt: draft?.createdAt || null,
    updatedAt: draft?.updatedAt || null,
    startedAt,
    inspectionDate:
      String(payload.submitBody?.answers?.ew_sig_inspection_date || payload.submitBody?.answers?.ew_q_planned_date || '').trim() ||
      startedAt,
    lastSavedAt: formatDraftLastSaved(draft),
    location: location || '',
    blockId,
    filledAnswerCount: filledAnswerCount(payload.submitBody?.answers),
    photoCount: photos.length,
    uploadedPhotoCount: photos.filter((url) => /^https?:\/\//i.test(url)).length,
    pendingPhotoCount: photos.filter((url) => isLocalOnlyPhotoUrl(url)).length,
    hasProgress: draftHasOfficerProgress(payload),
    possibleHillside:
      /hillside/i.test(haystack) || blockId === 'blk_000684' || blockId === 'blk_000685',
  }
}

/**
 * Drafts an officer can resume. Empty autosave shells are hidden so they cannot
 * be confused with a completed inspection saved at a similar time.
 */
export function selectResumableOfflineDrafts(drafts = []) {
  return (Array.isArray(drafts) ? drafts : []).filter((draft) => {
    if (!draft?.id) return false
    return draftHasOfficerProgress(draft.payload || {})
  })
}

/**
 * Identity lines for the saved-draft list so two Walkabouts saved at the same
 * minute can be told apart (draft id + photo count).
 */
export function formatSavedDraftIdentity(summary = {}) {
  const photoCount = Number(summary.photoCount) || 0
  const filledAnswerCount = Number(summary.filledAnswerCount) || 0
  const location = String(summary.location || '').trim() || String(summary.blockId || '').trim() || 'Location not recorded'
  const emptyShell = photoCount === 0 && filledAnswerCount === 0
  return {
    id: String(summary.id || ''),
    location,
    photoCount,
    filledAnswerCount,
    photoLabel: `${photoCount} photo${photoCount === 1 ? '' : 's'}`,
    answersLabel: `${filledAnswerCount} completed answer${filledAnswerCount === 1 ? '' : 's'}`,
    idLabel: summary.id ? `Draft ID ${summary.id}` : '',
    emptyShell,
    emptyShellLabel: emptyShell ? 'No answers or photos — do not resume this row if a matching inspection with photos exists' : '',
  }
}

/**
 * Snapshot of every draft on this phone. Read-only — callers must not write it back.
 */
export function readAllInspectionDraftsForExport() {
  return {
    exportedAt: new Date().toISOString(),
    storageKey: STORAGE_KEY,
    drafts: readOfflineInspectionDrafts(),
  }
}
