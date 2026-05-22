const TEMPLATES_CACHE_KEY = 'croydon_inspection_templates_cache_v1'

export function isBrowserOnline() {
  return typeof navigator === 'undefined' ? true : navigator.onLine
}

export async function safeFetch(url, options) {
  if (!isBrowserOnline()) return null
  try {
    return await fetch(url, options)
  } catch {
    return null
  }
}

export function readCachedTemplatesPayload() {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(TEMPLATES_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

export function writeCachedTemplatesPayload(payload) {
  if (typeof window === 'undefined' || !payload) return
  try {
    window.sessionStorage.setItem(TEMPLATES_CACHE_KEY, JSON.stringify(payload))
  } catch {
    /* ignore quota errors */
  }
}
