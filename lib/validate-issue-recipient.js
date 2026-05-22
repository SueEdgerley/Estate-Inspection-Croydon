import { resolveIssueRoutingRecipient } from '@/lib/resolve-issue-routing'

export const ISSUE_RECIPIENT_UNAVAILABLE_MESSAGE =
  'Inspection submitted, but the action could not be assigned because the selected issue recipient is no longer available.'

const ISSUE_RECIPIENT_TYPES = new Set([
  'issue_recipient',
  'issue recipient',
  'routing_mailbox',
  'routing mailbox',
])

const EMAIL_RE = /^[^\s@()<>]+@[^\s@()<>]+\.[^\s@()<>]+$/

export function isIssueRecipientCategory(row) {
  const category = String(row?.category || '').trim().toLowerCase()
  const role = String(row?.role || '').trim().toLowerCase()
  return ISSUE_RECIPIENT_TYPES.has(category) || ISSUE_RECIPIENT_TYPES.has(role)
}

function normalizeEmail(value) {
  const email = String(value || '').trim()
  return EMAIL_RE.test(email) ? email : ''
}

export function isRecipientPersonFkError(error) {
  const message = String(error?.message || error || '')
  const constraint = String(error?.constraint || '')
  return (
    constraint === 'actions_recipient_person_id_fkey' ||
    /actions_recipient_person_id_fkey/i.test(message) ||
    /recipient_person_id.*foreign key/i.test(message)
  )
}

export function recipientActionWarningFromError(error) {
  if (isRecipientPersonFkError(error)) return ISSUE_RECIPIENT_UNAVAILABLE_MESSAGE
  return null
}

/**
 * @param {import('@vercel/postgres').Sql} sql
 * @param {string | null | undefined} personId
 * @returns {Promise<{ valid: boolean, person: { id: string, email: string, name: string } | null }>}
 */
export async function validateIssueRecipient(sql, personId) {
  const raw = String(personId || '').trim()
  if (!raw) return { valid: false, person: null }

  try {
    const result = await sql`
      SELECT id, email, name, category, role, active
      FROM people
      WHERE id = ${raw}
      LIMIT 1
    `
    const row = result.rows[0]
    if (!row) return { valid: false, person: null }
    if (row.active === false) return { valid: false, person: null }
    if (!isIssueRecipientCategory(row)) return { valid: false, person: null }
    return {
      valid: true,
      person: {
        id: String(row.id),
        email: String(row.email || ''),
        name: String(row.name || ''),
      },
    }
  } catch (error) {
    console.warn('[validateIssueRecipient] lookup failed:', error?.message || error)
    return { valid: false, person: null }
  }
}

/**
 * Resolve a stored recipient value (people.id or legacy email string) to a valid issue recipient.
 * @param {import('@vercel/postgres').Sql} sql
 * @param {string | null | undefined} rawValue
 */
export async function resolveIssueRecipientPersonId(sql, rawValue) {
  const raw = String(rawValue || '').trim()
  if (!raw) return { valid: false, person: null, source: 'empty' }

  const byId = await validateIssueRecipient(sql, raw)
  if (byId.valid) return { ...byId, source: 'person_id' }

  const email = normalizeEmail(raw)
  if (!email) return { valid: false, person: null, source: 'invalid' }

  try {
    const result = await sql`
      SELECT id, email, name, category, role, active
      FROM people
      WHERE lower(trim(email)) = lower(trim(${email}))
      LIMIT 1
    `
    const row = result.rows[0]
    if (!row || row.active === false || !isIssueRecipientCategory(row)) {
      return { valid: false, person: null, source: 'email_not_issue_recipient' }
    }
    return {
      valid: true,
      source: 'email',
      person: {
        id: String(row.id),
        email: String(row.email || ''),
        name: String(row.name || ''),
      },
    }
  } catch (error) {
    console.warn('[resolveIssueRecipientPersonId] email lookup failed:', error?.message || error)
    return { valid: false, person: null, source: 'lookup_error' }
  }
}

/**
 * Validate selected recipient or fall back to category routing default.
 * @param {import('@vercel/postgres').Sql} sql
 * @param {{
 *   recipientPersonId?: string | null,
 *   issueCategory?: string | null,
 *   issueType?: string | null,
 *   estateId?: string | null,
 *   assignToRoleFallback?: string | null,
 *   allowRoutingFallback?: boolean,
 * }} params
 */
export async function resolveIssueRecipientForAction(sql, params = {}) {
  const {
    recipientPersonId,
    issueCategory,
    issueType,
    estateId,
    assignToRoleFallback,
    allowRoutingFallback = true,
  } = params

  const selectedRaw = String(recipientPersonId || '').trim()
  if (selectedRaw) {
    const resolved = await resolveIssueRecipientPersonId(sql, selectedRaw)
    if (resolved.valid && resolved.person?.id) {
      return { personId: resolved.person.id, warning: null, usedFallback: false }
    }
  }

  if (allowRoutingFallback && issueCategory) {
    const routed = await resolveIssueRoutingRecipient(sql, {
      issueCategory,
      issueType: issueType || null,
      estateId: estateId || null,
      assignToRoleFallback: assignToRoleFallback || null,
    })
    if (routed?.personId) {
      const validated = await validateIssueRecipient(sql, routed.personId)
      if (validated.valid && validated.person?.id) {
        return { personId: validated.person.id, warning: null, usedFallback: true }
      }
    }
  }

  if (selectedRaw) {
    return { personId: null, warning: ISSUE_RECIPIENT_UNAVAILABLE_MESSAGE, usedFallback: false }
  }

  return { personId: null, warning: null, usedFallback: false }
}

/**
 * Validate recipient_person_id before inserting/updating an action.
 * @param {import('@vercel/postgres').Sql} sql
 * @param {string | null | undefined} recipientPersonId
 */
export async function validateActionRecipientForInsert(sql, recipientPersonId) {
  const raw = String(recipientPersonId || '').trim()
  if (!raw) return { personId: null, warning: null }
  const resolved = await resolveIssueRecipientPersonId(sql, raw)
  if (resolved.valid && resolved.person?.id) {
    return { personId: resolved.person.id, warning: null }
  }
  return { personId: null, warning: ISSUE_RECIPIENT_UNAVAILABLE_MESSAGE }
}
