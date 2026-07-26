/**
 * Resolve people.id (or legacy email) to a resident-facing display label.
 * Prefer full name, then email; keep the raw id only as a last resort (with warn).
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * True when a stored answer looks like a people.id rather than a human label.
 */
export function looksLikePersonId(value) {
  const raw = String(value || '').trim()
  if (!raw) return false
  if (UUID_RE.test(raw)) return true
  if (/^(person_|ppl_)/i.test(raw)) return true
  return false
}

/**
 * @param {{ id?: string, name?: string|null, email?: string|null } | null | undefined} person
 * @param {string} fallbackId
 */
export function formatPersonDisplayName(person, fallbackId = '') {
  const name = String(person?.name || '').trim()
  if (name) return name
  const email = String(person?.email || '').trim()
  if (email) return email
  const id = String(person?.id || fallbackId || '').trim()
  return id
}

/**
 * Look up one person by id (active preferred, inactive allowed as fallback).
 * @param {import('@vercel/postgres').Sql} sqlFn
 * @param {string} personId
 * @returns {Promise<string>}
 */
export async function resolvePersonDisplayName(sqlFn, personId) {
  const id = String(personId || '').trim()
  if (!id) return ''

  // Already a display label (name / email), not an opaque id.
  if (!looksLikePersonId(id) && id.includes('@')) {
    return id
  }

  try {
    const active = await sqlFn`
      SELECT id, name, email
      FROM people
      WHERE id = ${id}
        AND COALESCE(active, true) = true
      LIMIT 1
    `
    if (active.rows[0]) {
      return formatPersonDisplayName(active.rows[0], id)
    }

    const any = await sqlFn`
      SELECT id, name, email
      FROM people
      WHERE id = ${id}
      LIMIT 1
    `
    if (any.rows[0]) {
      return formatPersonDisplayName(any.rows[0], id)
    }

    // Legacy: value may already be an email stored as the answer.
    if (id.includes('@')) {
      const byEmail = await sqlFn`
        SELECT id, name, email
        FROM people
        WHERE lower(trim(email)) = lower(trim(${id}))
        LIMIT 1
      `
      if (byEmail.rows[0]) {
        return formatPersonDisplayName(byEmail.rows[0], id)
      }
      return id
    }

    console.warn('[resolve-person-display-name] No people row for id; leaving raw value in report:', id)
    return id
  } catch (error) {
    console.warn(
      '[resolve-person-display-name] Lookup failed for id=%s:',
      id,
      error?.message || error
    )
    return id
  }
}

/** Alias used by walkabout email notifications. */
export const getActivePersonName = resolvePersonDisplayName

/**
 * Batch-resolve distinct person ids → display labels.
 * @param {import('@vercel/postgres').Sql} sqlFn
 * @param {Iterable<string>} ids
 * @returns {Promise<Map<string, string>>}
 */
export async function resolvePersonDisplayNames(sqlFn, ids) {
  const unique = [...new Set([...ids].map((id) => String(id || '').trim()).filter(Boolean))]
  const map = new Map()
  for (const id of unique) {
    map.set(id, await resolvePersonDisplayName(sqlFn, id))
  }
  return map
}

/**
 * Decide whether a template question stores a people.id that must be resolved for PDF/UI.
 */
export function questionStoresPersonId(question) {
  if (!question || typeof question !== 'object') return false
  return String(question.dynamic_options || '').trim() === 'active_people'
}
