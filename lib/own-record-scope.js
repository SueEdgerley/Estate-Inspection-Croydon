/**
 * Housing Officer own-record scope.
 * UI already hides the inspector filter; list/detail APIs must enforce this server-side.
 * Does not rewrite stored inspector_id / recipient_person_id.
 *
 * Historic inspections may store inspector_id as email, Clerk user id, people id,
 * or Airtable id. Linked users/people rows are collected so those identifiers
 * remain visible. No match still means no access — never fall back to everyone.
 */

import { sql } from '@vercel/postgres'
import { isPrivilegedAdmin } from './app-role-access.js'

export function roleMustScopeToOwnOperationalRecords(normalizedRole, clerkIsAdmin) {
  if (isPrivilegedAdmin(normalizedRole, clerkIsAdmin)) return false
  return String(normalizedRole || '') === 'housing_officer'
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
