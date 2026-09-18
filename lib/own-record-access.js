/**
 * Route helper: Housing Officer own-record enforcement.
 * Other roles are unchanged (caretaker, ESM, HTM, repairs, NV, admin).
 */

import { NextResponse } from 'next/server'
import { auth, currentUser } from '@clerk/nextjs/server'
import { sql } from '@vercel/postgres'
import { getCurrentUserEmail } from '@/lib/auth'
import { getAppRoleContextForClerkUser } from '@/lib/app-role-access'
import {
  identityCanAccessAction,
  identityOwnsInspection,
  loadOwnRecordIdentity,
  roleMustScopeToOwnOperationalRecords,
} from '@/lib/own-record-scope'

export async function getOwnRecordViewer() {
  const { userId } = await auth()
  if (!userId) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  const cu = await currentUser()
  const clerkIsAdmin = cu?.publicMetadata?.isAdmin === true
  const email =
    (await getCurrentUserEmail()) ||
    cu?.primaryEmailAddress?.emailAddress ||
    cu?.emailAddresses?.[0]?.emailAddress ||
    ''
  const roleCtx = await getAppRoleContextForClerkUser(userId, clerkIsAdmin, {
    ...cu?.publicMetadata,
    ...cu?.privateMetadata,
    ...cu?.unsafeMetadata,
  })
  const scopeOwn = roleMustScopeToOwnOperationalRecords(roleCtx.normalized, roleCtx.clerkIsAdmin)
  const identity = scopeOwn ? await loadOwnRecordIdentity(userId, email) : null
  return { userId, email, cu, roleCtx, scopeOwn, identity }
}

export function ownRecordInspectionForbidden(viewer, inspectorId) {
  if (!viewer?.scopeOwn) return null
  if (identityOwnsInspection(viewer.identity, inspectorId)) return null
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

export function ownRecordActionForbidden(viewer, { inspectorId, recipientPersonId } = {}) {
  if (!viewer?.scopeOwn) return null
  if (identityCanAccessAction(viewer.identity, { inspectorId, recipientPersonId })) return null
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

export async function loadInspectionInspectorId(inspectionId) {
  const result = await sql`
    SELECT inspector_id FROM inspections WHERE id = ${inspectionId} LIMIT 1
  `
  return result.rows[0] || null
}

export async function loadActionAccessMeta(actionId) {
  const result = await sql`
    SELECT a.id, a.recipient_person_id, i.inspector_id
    FROM actions a
    LEFT JOIN inspections i ON i.id = a.inspection_id
    WHERE a.id = ${actionId}
    LIMIT 1
  `
  return result.rows[0] || null
}
