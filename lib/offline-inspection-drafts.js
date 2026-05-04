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
