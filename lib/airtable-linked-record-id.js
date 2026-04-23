/**
 * Normalise Airtable linked-record fields to record ids (strings).
 * API / JSON may use plain strings, or objects like `{ id: 'rec…' }`, or arrays of either.
 */

/** @param {unknown} raw */
export function extractLinkedRecordId(raw) {
  if (raw == null) return null
  if (typeof raw === 'string' || typeof raw === 'number') {
    const s = String(raw).trim()
    return s === '' ? null : s
  }
  if (typeof raw === 'object') {
    const id = raw.id ?? raw.recordId ?? raw.record_id ?? raw._id
    if (id != null) {
      const s = String(id).trim()
      return s === '' ? null : s
    }
  }
  return null
}

/**
 * First linked section (or other) id from an Airtable link field value.
 * @param {unknown} linkField — string | string[] | { id } | array of those
 * @returns {string | null}
 */
export function firstLinkedRecordId(linkField) {
  if (linkField == null) return null
  if (Array.isArray(linkField)) {
    for (const item of linkField) {
      const id = extractLinkedRecordId(item)
      if (id) return id
    }
    return null
  }
  return extractLinkedRecordId(linkField)
}

/**
 * All linked record ids from an Airtable link field (deduped, order preserved).
 * @param {unknown} linkField
 * @returns {string[]}
 */
export function allLinkedRecordIds(linkField) {
  if (linkField == null) return []
  const arr = Array.isArray(linkField) ? linkField : [linkField]
  const out = []
  const seen = new Set()
  for (const item of arr) {
    const id = extractLinkedRecordId(item)
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}
