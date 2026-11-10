/**
 * Operational record scope for everyone who is not an owner, admin, or Clerk admin.
 * Repairs Contact is not included here: that job title uses the repairs queue.
 * Does not rewrite stored inspector_id / recipient_person_id.
 *
 * Historic inspections may store inspector_id as email, Clerk user id, people id,
 * or Airtable id. Linked users/people rows are collected so those identifiers
 * remain visible. Team membership adds the other people on the viewer's existing
 * analytics teams. No match still means no access — never fall back to everyone.
 */

import { sql } from '@vercel/postgres'
import { isPrivilegedAdmin } from './app-role-access.js'
import { memberMatchValues } from './analytics-teams.js'
import { actionInRepairsQueue } from './repairs-contact-rules.js'

export function roleMustScopeToOwnOperationalRecords(normalizedRole, clerkIsAdmin) {
  if (isPrivilegedAdmin(normalizedRole, clerkIsAdmin)) return false
  return String(normalizedRole || '') !== 'repairs_contact'
}

function normList(values) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => String(value || '').trim()).filter(Boolean))]
}

export function buildOwnRecordIdentity({
  emails = [],
  peopleIds = [],
  clerkIds = [],
  airtableIds = [],
  clerkUserId = null,
} = {}) {
  const normEmails = [...new Set(normList(emails).map((value) => value.toLowerCase()))]
  const normPeopleIds = normList(peopleIds)
  const normClerkIds = normList(clerkIds)
  const normAirtableIds = normList(airtableIds)
  const primaryClerk = String(clerkUserId || normClerkIds[0] || '').trim() || null
  const inspectorMatchValues = [
    ...new Set(
      [
        ...normEmails,
        ...normClerkIds.map((value) => value.toLowerCase()),
        ...normPeopleIds.map((value) => value.toLowerCase()),
        ...normAirtableIds.map((value) => value.toLowerCase()),
      ].filter(Boolean)
    ),
  ]
  const recipientMatchValues = [
    ...new Set(
      [
        ...normPeopleIds.map((value) => value.toLowerCase()),
        ...normEmails,
        ...normAirtableIds.map((value) => value.toLowerCase()),
      ].filter(Boolean)
    ),
  ]
  return {
    emails: normEmails,
    peopleIds: normPeopleIds,
    clerkIds: normClerkIds,
    airtableIds: normAirtableIds,
    clerkUserId: primaryClerk,
    inspectorMatchValues,
    recipientMatchValues,
  }
}

export function emptyOwnRecordIdentity() {
  return buildOwnRecordIdentity()
}

export async function loadOwnRecordIdentity(clerkUserId, clerkEmail = '') {
  const emails = new Set()
  const peopleIds = new Set()
  const clerkIds = new Set()
  const airtableIds = new Set()
  const email = String(clerkEmail || '').trim()
  if (email) emails.add(email.toLowerCase())
  const clerkId = String(clerkUserId || '').trim()
  if (clerkId) clerkIds.add(clerkId)

  try {
    const userRows = await sql`
      SELECT
        NULLIF(trim(clerk_user_id), '') AS clerk_user_id,
        NULLIF(trim(email), '') AS email,
        NULLIF(trim(people_id), '') AS people_id
      FROM users
      WHERE (${clerkId} <> '' AND clerk_user_id = ${clerkId})
         OR (${email} <> '' AND lower(trim(COALESCE(email, ''))) = ${email.toLowerCase()})
    `
    for (const row of userRows.rows || []) {
      if (row.clerk_user_id) clerkIds.add(String(row.clerk_user_id))
      if (row.email) emails.add(String(row.email).toLowerCase())
      if (row.people_id) peopleIds.add(String(row.people_id))
    }

    const emailList = [...emails]
    const peopleIdList = [...peopleIds]
    const peopleRows =
      emailList.length || peopleIdList.length
        ? await sql.query(
            `SELECT
               NULLIF(trim(id), '') AS id,
               NULLIF(trim(email), '') AS email,
               NULLIF(trim(airtable_id), '') AS airtable_id
             FROM people
             WHERE (${peopleIdList.length} > 0 AND id = ANY($1::text[]))
                OR (${emailList.length} > 0 AND lower(trim(COALESCE(email, ''))) = ANY($2::text[]))`,
            [peopleIdList, emailList]
          )
        : { rows: [] }

    for (const row of peopleRows.rows || []) {
      if (row.id) peopleIds.add(String(row.id))
      if (row.email) emails.add(String(row.email).toLowerCase())
      if (row.airtable_id) airtableIds.add(String(row.airtable_id))
    }

    const linkedEmails = [...emails]
    const linkedPeopleIds = [...peopleIds]
    if (linkedEmails.length || linkedPeopleIds.length) {
      const extraUsers = await sql.query(
        `SELECT
           NULLIF(trim(clerk_user_id), '') AS clerk_user_id,
           NULLIF(trim(email), '') AS email,
           NULLIF(trim(people_id), '') AS people_id
         FROM users
         WHERE (${linkedPeopleIds.length} > 0 AND people_id = ANY($1::text[]))
            OR (${linkedEmails.length} > 0 AND lower(trim(COALESCE(email, ''))) = ANY($2::text[]))`,
        [linkedPeopleIds, linkedEmails]
      )
      for (const row of extraUsers.rows || []) {
        if (row.clerk_user_id) clerkIds.add(String(row.clerk_user_id))
        if (row.email) emails.add(String(row.email).toLowerCase())
        if (row.people_id) peopleIds.add(String(row.people_id))
      }
    }
  } catch {
    /* identity stays Clerk email / id only */
  }

  return buildOwnRecordIdentity({
    emails: [...emails],
    peopleIds: [...peopleIds],
    clerkIds: [...clerkIds],
    airtableIds: [...airtableIds],
    clerkUserId: clerkId || null,
  })
}

export function identityOwnsInspection(identity, inspectorId) {
  const value = String(inspectorId || '').trim().toLowerCase()
  if (!value || !identity?.inspectorMatchValues?.length) return false
  return identity.inspectorMatchValues.includes(value)
}

export function identityCanAccessAction(identity, { inspectorId, recipientPersonId } = {}) {
  if (identityOwnsInspection(identity, inspectorId)) return true
  const recipient = String(recipientPersonId || '').trim().toLowerCase()
  const needles = identity?.recipientMatchValues?.length
    ? identity.recipientMatchValues
    : (identity?.peopleIds || []).map((id) => String(id || '').trim().toLowerCase()).filter(Boolean)
  if (!recipient || !needles.length) return false
  return needles.includes(recipient)
}

/**
 * Inspections and their actions for people on a team the viewer already belongs
 * to, including a team they manage. This does not grant every signed-in user
 * the whole directory.
 */
export function teamInspectorMatchValuesForViewer(teams, identity) {
  const people = new Set((identity?.peopleIds || []).map((value) => String(value || '').trim()).filter(Boolean))
  const values = new Set(
    (identity?.inspectorMatchValues || []).map((value) => String(value || '').trim().toLowerCase()).filter(Boolean)
  )
  const allowed = new Set()
  for (const team of Array.isArray(teams) ? teams : []) {
    const managerId = String(team?.managerPersonId || team?.manager_person_id || '').trim()
    const isManager = Boolean(managerId && (people.has(managerId) || values.has(managerId.toLowerCase())))
    const isMember = (team?.members || []).some((member) => {
      const personId = String(member?.personId || member?.person_id || '').trim()
      if (personId && people.has(personId)) return true
      return memberMatchValues(member).some((value) => values.has(value))
    })
    if (!isManager && !isMember) continue
    if (managerId) allowed.add(managerId.toLowerCase())
    for (const member of team.members || []) {
      for (const value of memberMatchValues(member)) allowed.add(value)
    }
  }
  return [...allowed]
}

export function expandIdentityWithTeamAccess(identity, teamMatchValues) {
  const base = identity || emptyOwnRecordIdentity()
  const extra = (Array.isArray(teamMatchValues) ? teamMatchValues : [])
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean)
  if (!extra.length) return base
  return {
    ...base,
    inspectorMatchValues: [...new Set([...(base.inspectorMatchValues || []), ...extra])],
  }
}

function teamsFromMemberRows(rows) {
  const byId = new Map()
  for (const row of rows || []) {
    const teamId = String(row?.team_id || '').trim()
    if (!teamId) continue
    let team = byId.get(teamId)
    if (!team) {
      team = { id: teamId, managerPersonId: row.manager_person_id || null, members: [] }
      byId.set(teamId, team)
    }
    const personId = String(row.person_id || '').trim()
    if (!personId) continue
    const matchValues = [row.person_id, row.member_email, row.airtable_id, row.user_email, row.clerk_user_id]
      .map((value) => String(value || '').trim().toLowerCase())
      .filter(Boolean)
    const existing = team.members.find((member) => member.personId === personId)
    if (existing) {
      existing.matchValues = [...new Set([...(existing.matchValues || []), ...matchValues])]
      continue
    }
    team.members.push({
      personId,
      email: row.member_email || null,
      airtableId: row.airtable_id || null,
      userEmail: row.user_email || null,
      clerkUserId: row.clerk_user_id || null,
      matchValues,
    })
  }
  return [...byId.values()]
}

/** Own identity plus existing analytics-team members. A missing team table leaves own records only. */
export async function loadScopedOperationalIdentity(clerkUserId, clerkEmail = '') {
  const identity = await loadOwnRecordIdentity(clerkUserId, clerkEmail)
  let teamValues = []
  try {
    const result = await sql`
      SELECT
        t.id AS team_id,
        t.manager_person_id,
        m.person_id,
        p.email AS member_email,
        p.airtable_id,
        u.email AS user_email,
        u.clerk_user_id
      FROM analytics_teams t
      LEFT JOIN analytics_team_members m ON m.team_id = t.id
      LEFT JOIN people p ON p.id = m.person_id
      LEFT JOIN users u
        ON p.id IS NOT NULL
       AND (u.people_id = p.id OR lower(trim(COALESCE(u.email, ''))) = lower(trim(COALESCE(p.email, ''))))
    `
    teamValues = teamInspectorMatchValuesForViewer(teamsFromMemberRows(result.rows), identity)
  } catch {
    teamValues = []
  }
  return expandIdentityWithTeamAccess(identity, teamValues)
}

/**
 * One decision for an action record.
 * Owners and admins pass. Repairs Contact stays on the repairs queue.
 * Everyone else needs their own inspection, an action assigned to them, or a team inspection.
 */
export function canAccessOperationalAction({
  privileged = false,
  repairsContact = false,
  identity = null,
  action = null,
  mailboxId = null,
} = {}) {
  if (privileged) return true
  if (!action) return false
  if (repairsContact) return actionInRepairsQueue(action, mailboxId)
  return identityCanAccessAction(identity, {
    inspectorId: action.inspector_id || action.inspection_inspector_id,
    recipientPersonId: action.recipient_person_id,
  })
}

export function canAccessOperationalInspection({
  privileged = false,
  repairsContact = false,
  identity = null,
  inspectorId = null,
} = {}) {
  if (privileged) return true
  if (repairsContact) return false
  return identityOwnsInspection(identity, inspectorId)
}

/** SQL for list, search, and download queries. Empty identity matches nothing. */
export function operationalActionVisibilitySql(identity, { inspectionAlias = 'i', actionAlias = 'a', startIndex = 1 } = {}) {
  const inspectorIds = [...new Set((identity?.inspectorMatchValues || []).map((value) => String(value || '').trim().toLowerCase()).filter(Boolean))]
  const recipientIds = [...new Set((identity?.recipientMatchValues || []).map((value) => String(value || '').trim().toLowerCase()).filter(Boolean))]
  if (!inspectorIds.length && !recipientIds.length) return { sql: 'FALSE', params: [] }
  const params = []
  const parts = []
  let index = startIndex - 1
  if (inspectorIds.length) {
    params.push(inspectorIds)
    index += 1
    parts.push(`lower(trim(COALESCE(${inspectionAlias}.inspector_id, ''))) = ANY($${index}::text[])`)
  }
  if (recipientIds.length) {
    params.push(recipientIds)
    index += 1
    parts.push(`lower(trim(COALESCE(${actionAlias}.recipient_person_id, ''))) = ANY($${index}::text[])`)
  }
  return { sql: `(${parts.join(' OR ')})`, params }
}

/** SQL fragment: inspection belongs to this Housing Officer (inspector_id match). */
export function sqlInspectionOwnedByIdentity(alias, placeholder) {
  const col = alias ? `${alias}.inspector_id` : 'inspector_id'
  return `lower(trim(COALESCE(${col}, ''))) = ANY(${placeholder}::text[])`
}

/**
 * SQL fragment: action is on the officer's inspection or assigned to their people record.
 * Existing model: inspections.inspector_id (submitter) and actions.recipient_person_id (assignee).
 */
export function sqlActionVisibleToIdentity({
  inspectionAlias = 'i',
  actionAlias = 'a',
  inspectorPlaceholder,
  peoplePlaceholder = null,
  peopleIds = [],
} = {}) {
  const inspectionOwned = sqlInspectionOwnedByIdentity(inspectionAlias, inspectorPlaceholder)
  if (!peoplePlaceholder || !peopleIds.length) return `(${inspectionOwned})`
  return `(${inspectionOwned} OR lower(trim(COALESCE(${actionAlias}.recipient_person_id, ''))) = ANY(${peoplePlaceholder}::text[]))`
}
