/**
 * Temporary read-only backup of inspection drafts stored on this device.
 * This module must only call localStorage.getItem. Do not add setItem, removeItem,
 * resume, submit, or upload helpers here.
 */

export const OFFLINE_DRAFTS_STORAGE_KEY = 'croydon_inspection_offline_drafts_v1'
export const INSPECTION_RESUME_STORAGE_KEY = 'inspection-draft'

function browserLocalStorage() {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function readRawItem(key) {
  const storage = browserLocalStorage()
  if (!storage) return null
  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}

function parseJson(raw, fallback) {
  if (raw == null || raw === '') return { value: fallback, parseError: null }
  try {
    return { value: JSON.parse(raw), parseError: null }
  } catch (error) {
    return { value: fallback, parseError: String(error?.message || error) }
  }
}

function collectPhotoUrls(value, urls = []) {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('blob:') || trimmed.startsWith('data:')) {
      urls.push(trimmed)
      return urls
    }
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        collectPhotoUrls(JSON.parse(trimmed), urls)
      } catch {
        /* ignore invalid JSON */
      }
    }
    return urls
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectPhotoUrls(item, urls))
    return urls
  }
  if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      if (/photo/i.test(key) || nested == null || typeof nested !== 'string' || nested.startsWith('[') || nested.startsWith('{') || Array.isArray(nested) || typeof nested === 'object') {
        collectPhotoUrls(nested, urls)
      }
    }
  }
  return urls
}

function isBlankAnswer(value) {
  if (value == null) return true
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  return !trimmed || trimmed === '[]' || trimmed === '{}'
}

function filledAnswerCount(answers) {
  if (!answers || typeof answers !== 'object') return 0
  return Object.values(answers).filter((value) => !isBlankAnswer(value)).length
}

/**
 * Full snapshot of both draft keys on this phone. Read-only.
 * Parsed objects are included so answers, location and photo URLs are intact.
 * Raw strings are included only when JSON parsing fails, so nothing is discarded.
 */
export function readPhoneDraftsBackup() {
  const draftsRaw = readRawItem(OFFLINE_DRAFTS_STORAGE_KEY)
  const resumeRaw = readRawItem(INSPECTION_RESUME_STORAGE_KEY)
  const draftsParsed = parseJson(draftsRaw, [])
  const resumeParsed = parseJson(resumeRaw, null)
  const drafts = Array.isArray(draftsParsed.value) ? draftsParsed.value : []
  const resumeValue = resumeParsed.value
  const resumeSlot = resumeValue && typeof resumeValue === 'object' ? resumeValue : null
  const raw = {}
  if (draftsParsed.parseError) raw[OFFLINE_DRAFTS_STORAGE_KEY] = draftsRaw
  if (resumeParsed.parseError) raw[INSPECTION_RESUME_STORAGE_KEY] = resumeRaw

  return {
    exportedAt: new Date().toISOString(),
    readOnly: true,
    keys: {
      drafts: OFFLINE_DRAFTS_STORAGE_KEY,
      resume: INSPECTION_RESUME_STORAGE_KEY,
    },
    drafts,
    resumeSlot,
    ...(Object.keys(raw).length ? { raw } : {}),
    parseErrors: {
      drafts: draftsParsed.parseError,
      resume: resumeParsed.parseError,
    },
  }
}

export function summarizeOfflineDraft(draft) {
  const payload = draft?.payload || {}
  const body = payload.submitBody || {}
  const location = String(payload.locationLabel || body.location || payload.location || '').trim()
  const blockId = String(body.block_id || payload.blockId || '').trim()
  const photos = [...new Set(collectPhotoUrls(payload))]
  const answers = body.answers || {}
  const haystack = [location, payload.location, payload.locationLabel, body.location, draft?.label]
    .filter(Boolean)
    .join(' ')
  const timestamp = draft?.updatedAt || draft?.createdAt
  return {
    id: draft?.id || '',
    label: draft?.label || payload.templateName || payload.formType || 'Inspection',
    createdAt: draft?.createdAt || null,
    updatedAt: draft?.updatedAt || null,
    startedAt: body.inspection_start_time || payload.inspectionStartTime || null,
    lastSavedAt: timestamp
      ? new Date(timestamp).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
      : null,
    location,
    blockId,
    filledAnswerCount: filledAnswerCount(answers),
    photoCount: photos.length,
    uploadedPhotoCount: photos.filter((url) => /^https?:\/\//i.test(url)).length,
    pendingPhotoCount: photos.filter((url) => url.startsWith('blob:') || url.startsWith('data:')).length,
    possibleHillside: /hillside/i.test(haystack) || blockId === 'blk_000684' || blockId === 'blk_000685',
  }
}
