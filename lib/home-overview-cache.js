/**
 * Short-lived in-memory cache for /api/home-overview responses.
 * Reduces repeated identical Neon round-trips during page refresh / navigation.
 */

const DEFAULT_TTL_MS = 90_000
const MAX_ENTRIES = 200

/** @type {Map<string, { expires: number, payload: object }>} */
const cache = new Map()

export function homeOverviewCacheKey({ userId, preset }) {
  return `${userId || 'anon'}:${preset || 'month'}`
}

export function getHomeOverviewCache(key) {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expires) {
    cache.delete(key)
    return null
  }
  return entry.payload
}

export function setHomeOverviewCache(key, payload, ttlMs = DEFAULT_TTL_MS) {
  cache.set(key, { payload, expires: Date.now() + ttlMs })
  if (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value
    if (oldest) cache.delete(oldest)
  }
}

/** Test helper */
export function clearHomeOverviewCache() {
  cache.clear()
}
