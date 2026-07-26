/**
 * Shared action / evidence photo helpers for all inspection templates.
 * Use these for action plan items and issue evidence so every form
 * saves and reports photos the same way (Caretaker, Walkabout, ESM, etc.).
 */

import { parseActionPhotoUrls } from '@/lib/action-display-formatter'

/** Max evidence photos per action / question (aligned with wizard defaults). */
export const MAX_ACTION_PHOTOS = 5

/** Max photos for compact “single evidence” fields (paper form, NV optional single). */
export const MAX_SINGLE_PHOTO = 1

export { parseActionPhotoUrls }

/**
 * Normalize any stored photo_urls value into a clean string[].
 */
export function normalizeActionPhotoUrls(raw) {
  return parseActionPhotoUrls(raw)
}

/**
 * Cap a URL list to the shared action-photo limit (or a custom max).
 */
export function capActionPhotoUrls(urls, max = MAX_ACTION_PHOTOS) {
  const list = normalizeActionPhotoUrls(urls)
  const limit = Math.max(1, Number(max) || MAX_ACTION_PHOTOS)
  return list.slice(0, limit)
}

/**
 * Merge several photo sources (e.g. repair_photo_url + photo_urls) without duplicates.
 */
export function mergeActionPhotoUrls(...sources) {
  const seen = new Set()
  const out = []
  for (const source of sources) {
    for (const url of normalizeActionPhotoUrls(source)) {
      const key = url.trim()
      if (!key || seen.has(key)) continue
      seen.add(key)
      out.push(key)
    }
  }
  return out
}
