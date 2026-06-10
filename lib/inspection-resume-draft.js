/**
 * Single-slot "Resume saved inspection?" draft for the new inspection form.
 *
 * Stored shape under localStorage key "inspection-draft":
 * {
 *   version: 1,
 *   savedAt: ISO timestamp string,
 *   payload: { ...currentDraftPayload, locationLabel, offlineDraftId }
 * }
 *
 * This is intentionally separate from the multi-draft offline store in
 * lib/offline-inspection-drafts.js — it powers the on-mount resume prompt only.
 */

export const INSPECTION_RESUME_DRAFT_KEY = 'inspection-draft'

function browserStorage() {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function readInspectionResumeDraft() {
  const storage = browserStorage()
  if (!storage) return null
  try {
    const raw = storage.getItem(INSPECTION_RESUME_DRAFT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || !parsed.payload || typeof parsed.payload !== 'object') {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function writeInspectionResumeDraft(payload) {
  const storage = browserStorage()
  if (!storage || !payload || typeof payload !== 'object') return false
  try {
    storage.setItem(
      INSPECTION_RESUME_DRAFT_KEY,
      JSON.stringify({ version: 1, savedAt: new Date().toISOString(), payload })
    )
    return true
  } catch {
    return false
  }
}

export function clearInspectionResumeDraft() {
  const storage = browserStorage()
  if (!storage) return
  try {
    storage.removeItem(INSPECTION_RESUME_DRAFT_KEY)
  } catch {
    /* ignore */
  }
}

/**
 * True when the draft contains more than just a selected template, so the
 * resume prompt is only shown for inspections with real progress.
 */
export function resumeDraftHasMeaningfulContent(payload) {
  const body = payload?.submitBody
  if (!body || typeof body !== 'object') return false
  return Boolean(
    body.block_id ||
      (typeof body.location === 'string' && body.location.trim()) ||
      (typeof body.description === 'string' && body.description.trim()) ||
      Object.keys(body.answers || {}).length ||
      Object.keys(body.answer_extras || {}).length
  )
}

function formatTimeOfDay(date) {
  return date
    .toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true })
    .replace(/\s/g, '')
    .toLowerCase()
}

function isSameCalendarDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/**
 * Friendly relative label, e.g. "Today 10:42am", "Yesterday 3:15pm",
 * or "3 Jun 2026, 10:42am" for older drafts.
 */
export function formatResumeDraftSavedAt(savedAt, now = new Date()) {
  if (!savedAt) return null
  const date = new Date(savedAt)
  if (Number.isNaN(date.getTime())) return null

  const time = formatTimeOfDay(date)
  if (isSameCalendarDay(date, now)) return `Today ${time}`

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (isSameCalendarDay(date, yesterday)) return `Yesterday ${time}`

  const dateLabel = date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  })
  return `${dateLabel}, ${time}`
}
