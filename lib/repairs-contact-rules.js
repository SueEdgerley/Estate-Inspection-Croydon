/**
 * Repairs Contact is a job title. It does not reuse Resident access or the
 * Repairs Officer label. The Repairs issue-recipient mailbox identifies records.
 */

export const REPAIRS_CONTACT_JOB_TITLE = 'repairs_contact'
export const REPAIRS_MAILBOX_LABEL = 'repairs'
export const REPAIRS_PROGRESS_FIELDS = ['status', 'repair_notes', 'repair_photo_url']
export const REPAIRS_STATUS_VALUES = ['open', 'in_progress', 'completed', 'closed']

export function normalizeAccessToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export function isRepairsContactJobTitle(jobTitle) {
  return normalizeAccessToken(jobTitle) === REPAIRS_CONTACT_JOB_TITLE
}

/**
 * Restricted access applies only to this job title, and never to an owner,
 * admin, or Clerk admin. Repairs Officer stays on its existing path.
 */
function isPrivilegedSystemRole(systemRole, clerkIsAdmin) {
  if (clerkIsAdmin) return true
  const role = normalizeAccessToken(systemRole)
  return role === 'owner' || role === 'admin'
}

export function isRepairsContactAccess(roleCtx) {
  if (!roleCtx) return false
  if (isPrivilegedSystemRole(roleCtx.systemRole, roleCtx.clerkIsAdmin)) return false
  return isRepairsContactJobTitle(roleCtx.jobTitle)
}

export function isIssueRecipientCategory(category) {
  const token = normalizeAccessToken(category)
  return token === 'issue_recipient'
}

/** Mailbox match is the recipient's name or role, not a staff job title. */
export function personIsRepairsMailbox(person) {
  if (!person || person.active === false) return false
  if (!isIssueRecipientCategory(person.category)) return false
  const name = normalizeAccessToken(person.name)
  const role = normalizeAccessToken(person.role)
  return name === REPAIRS_MAILBOX_LABEL || role === REPAIRS_MAILBOX_LABEL
}

export function selectRepairsMailbox(people) {
  const matches = (Array.isArray(people) ? people : []).filter(personIsRepairsMailbox)
  if (matches.length !== 1) return { mailbox: null, matches }
  return { mailbox: matches[0], matches }
}

export function actionBelongsToRepairsMailbox(action, mailboxId) {
  const mailbox = String(mailboxId || '').trim()
  if (!mailbox) return false
  return String(action?.recipient_person_id || '').trim() === mailbox
}

export const REPAIRS_QUEUE_CATEGORIES = ['repair', 'repairs']

/**
 * Queue membership does not write recipient_person_id.
 * Assigned mailbox records stay in. Unassigned repairs-category records are the
 * backlog. A record assigned to anyone else stays out.
 */
export function actionInRepairsQueue(action, mailboxId) {
  const mailbox = String(mailboxId || '').trim()
  if (!mailbox || !action) return false
  const recipient = String(action.recipient_person_id || '').trim()
  if (recipient) return recipient === mailbox
  return REPAIRS_QUEUE_CATEGORIES.includes(normalizeAccessToken(action.category))
}

export function repairsQueueMembershipSql(mailboxPlaceholder) {
  return `(
    a.recipient_person_id = ${mailboxPlaceholder}
    OR (
      COALESCE(trim(a.recipient_person_id), '') = ''
      AND lower(trim(COALESCE(a.category, ''))) IN ('repair', 'repairs')
    )
  )`
}

export function repairsQueueStatusSql(statusFilter) {
  const status = normalizeAccessToken(statusFilter || 'outstanding')
  if (status === 'all') return { sql: 'TRUE', status: 'all' }
  if (status === 'completed' || status === 'closed') {
    return {
      sql: `lower(trim(COALESCE(a.status, ''))) IN ('completed', 'closed')`,
      status: 'completed',
    }
  }
  return {
    sql: `lower(trim(COALESCE(a.status, ''))) IN ('open', 'in_progress', 'in progress', '')`,
    status: 'outstanding',
  }
}

export function repairsQueueSearchClause(search, startIndex, options = {}) {
  const raw = String(search || '').trim()
  if (!raw) return { sql: '', params: [] }
  const params = []
  const placeholder = (value) => {
    params.push(value)
    return `$${startIndex + params.length - 1}`
  }
  const parts = []
  const issueNumber = raw.match(/^(?:iss[-–]?)?0*([1-9]\d*)$/i)
  if (issueNumber) parts.push(`a.issue_number = ${placeholder(Number(issueNumber[1]))}`)
  const like = placeholder(`%${raw.replace(/[%_]/g, '\\$&')}%`)
  parts.push(`a.id ILIKE ${like} ESCAPE '\\'`)
  parts.push(`COALESCE(a.issue_number::text, '') ILIKE ${like} ESCAPE '\\'`)
  parts.push(`COALESCE(a.location, '') ILIKE ${like} ESCAPE '\\'`)
  parts.push(`COALESCE(a.description, '') ILIKE ${like} ESCAPE '\\'`)
  parts.push(`COALESCE(a.title, '') ILIKE ${like} ESCAPE '\\'`)
  parts.push(`COALESCE(a.comment, '') ILIKE ${like} ESCAPE '\\'`)
  if (options.includePlaceNames) {
    parts.push(`COALESCE(e.name, '') ILIKE ${like} ESCAPE '\\'`)
    parts.push(`COALESCE(b.name, '') ILIKE ${like} ESCAPE '\\'`)
    parts.push(`COALESCE(i.location_label, '') ILIKE ${like} ESCAPE '\\'`)
    parts.push(`COALESCE(i.title, '') ILIKE ${like} ESCAPE '\\'`)
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    parts.push(`a.created_at::date = ${placeholder(raw)}::date`)
  }
  return { sql: `(${parts.join(' OR ')})`, params }
}

export function repairsRecordFlags(action, mailboxId, relatedDuplicateIds = []) {
  const flags = []
  const recipient = String(action?.recipient_person_id || '').trim()
  const category = normalizeAccessToken(action?.category)
  if (recipient && recipient === String(mailboxId || '').trim() && !REPAIRS_QUEUE_CATEGORIES.includes(category)) {
    flags.push({
      type: 'uncertain_ownership',
      reason: `Assigned to the Repairs mailbox, but the category is ${category || 'blank'}. The assignment has not been changed.`,
    })
  }
  const related = [...new Set((relatedDuplicateIds || []).filter((id) => id && id !== action?.id))]
  if (related.length) {
    flags.push({
      type: 'possible_duplicate',
      reason: 'Another record matches this block and description, or the same inspection question. It has not been merged, deleted or closed.',
      actionIds: related.slice(0, 5),
    })
  }
  return flags
}

export function duplicateIdsByAction(rows) {
  const groups = new Map()
  const add = (key, id) => {
    if (!key || !id) return
    const current = groups.get(key) || []
    current.push(id)
    groups.set(key, current)
  }
  for (const row of rows || []) {
    const text = String(row.text_key || '').trim()
    if (text) add(`text:${row.block_key || ''}::${text}`, row.id)
    if (row.inspection_id && row.question_id) add(`question:${row.inspection_id}::${row.question_id}`, row.id)
  }
  const related = new Map()
  for (const ids of groups.values()) {
    const unique = [...new Set(ids)]
    if (unique.length < 2) continue
    for (const id of unique) {
      const others = related.get(id) || []
      for (const other of unique) if (other !== id && !others.includes(other)) others.push(other)
      related.set(id, others)
    }
  }
  return related
}

export function normalizeRepairsStatus(value) {
  const status = normalizeAccessToken(value)
  if (status === 'inprogress') return 'in_progress'
  return status
}

/**
 * Reject the whole update when it includes anything except progress fields.
 * Returns an error message, or null when the body is acceptable.
 */
export function repairsProgressRejection(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return 'A progress update is required'
  }
  const keys = Object.keys(body)
  if (!keys.length) return 'A progress update is required'
  const extra = keys.filter((key) => !REPAIRS_PROGRESS_FIELDS.includes(key))
  if (extra.length) {
    return 'Repairs Contact updates can only change status, progress notes and the completion photo'
  }
  if (body.status !== undefined && !REPAIRS_STATUS_VALUES.includes(normalizeRepairsStatus(body.status))) {
    return 'Invalid status'
  }
  const hasNote = body.repair_notes !== undefined && String(body.repair_notes || '').trim()
  const hasPhoto = body.repair_photo_url !== undefined && String(body.repair_photo_url || '').trim()
  const hasStatus = body.status !== undefined && String(body.status || '').trim()
  if (!hasNote && !hasPhoto && !hasStatus) return 'A progress update is required'
  return null
}
