/**
 * Housing Officer own-record access: roles, identity matching, list SQL.
 * Run: node --import ./scripts/esm-alias-register.mjs --test scripts/own-record-scope.test.mjs
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  buildOwnRecordIdentity,
  canAccessOperationalAction,
  canAccessOperationalInspection,
  emptyOwnRecordIdentity,
  expandIdentityWithTeamAccess,
  identityCanAccessAction,
  identityOwnsInspection,
  operationalActionVisibilitySql,
  roleMustScopeToOwnOperationalRecords,
  teamInspectorMatchValuesForViewer,
} from '../lib/own-record-scope.js'
import { getRoleUiFlags } from '../lib/app-role-access.js'
import { buildInspectionWhereConditions, joinSqlAnd } from '../lib/inspection-filters.js'
import { buildActionListWhere } from '../lib/action-list-filters.js'
import { canViewInspectionFollowUpUpdates } from '../lib/inspection-follow-up-updates.js'

const HO_A = buildOwnRecordIdentity({
  emails: ['officer.a@croydon.gov.uk'],
  peopleIds: ['person-a'],
  clerkIds: ['user_a'],
  airtableIds: ['recAAAA1111'],
  clerkUserId: 'user_a',
})
const HO_B = buildOwnRecordIdentity({
  emails: ['officer.b@croydon.gov.uk'],
  peopleIds: ['person-b'],
  clerkIds: ['user_b'],
  airtableIds: ['recBBBB2222'],
  clerkUserId: 'user_b',
})

describe('roleMustScopeToOwnOperationalRecords', () => {
  it('scopes every operational user except Repairs Contact', () => {
    assert.equal(roleMustScopeToOwnOperationalRecords('housing_officer', false), true)
    assert.equal(roleMustScopeToOwnOperationalRecords('caretaker', false), true)
    assert.equal(roleMustScopeToOwnOperationalRecords('esm', false), true)
    assert.equal(roleMustScopeToOwnOperationalRecords('housing_team_manager', false), true)
    assert.equal(roleMustScopeToOwnOperationalRecords('resident', false), true)
    assert.equal(roleMustScopeToOwnOperationalRecords('repairs_officer', false), true)
    assert.equal(roleMustScopeToOwnOperationalRecords('', false), true)
    assert.equal(roleMustScopeToOwnOperationalRecords('repairs_contact', false), false)
  })

  it('does not scope owners, admins, or Clerk admins', () => {
    assert.equal(roleMustScopeToOwnOperationalRecords('admin', false), false)
    assert.equal(roleMustScopeToOwnOperationalRecords('owner', false), false)
    assert.equal(roleMustScopeToOwnOperationalRecords('housing_officer', true), false)
    assert.equal(roleMustScopeToOwnOperationalRecords('repairs_contact', true), false)
  })
})

describe('getRoleUiFlags own-record flag', () => {
  it('scopes operational users and leaves owners, admins, and Repairs Contact unscoped', () => {
    assert.equal(getRoleUiFlags('user', false, 'Housing Officer').mustScopeToOwnRecords, true)
    assert.equal(getRoleUiFlags('user', false, 'Housing Team Manager').mustScopeToOwnRecords, true)
    assert.equal(getRoleUiFlags('user', false, 'Caretaker').mustScopeToOwnRecords, true)
    assert.equal(getRoleUiFlags('user', false, 'ESM').mustScopeToOwnRecords, true)
    assert.equal(getRoleUiFlags('user', false, 'Resident').mustScopeToOwnRecords, true)
    assert.equal(getRoleUiFlags('user', false, 'Repairs Officer').mustScopeToOwnRecords, true)
    assert.equal(getRoleUiFlags('admin', false, 'Housing Officer').mustScopeToOwnRecords, false)
    assert.equal(getRoleUiFlags('owner', false, 'Repairs Contact').mustScopeToOwnRecords, false)
    assert.equal(getRoleUiFlags('user', true, 'Housing Officer').mustScopeToOwnRecords, false)
    assert.equal(getRoleUiFlags('user', false, 'Repairs Contact').mustScopeToOwnRecords, false)
  })
})

describe('identity matching', () => {
  it('lets Housing Officer A own historic inspections stored as email, Clerk id, people id, or Airtable id', () => {
    assert.equal(identityOwnsInspection(HO_A, 'officer.a@croydon.gov.uk'), true)
    assert.equal(identityOwnsInspection(HO_A, 'USER_A'), true)
    assert.equal(identityOwnsInspection(HO_A, 'person-a'), true)
    assert.equal(identityOwnsInspection(HO_A, 'recAAAA1111'), true)
    assert.equal(identityOwnsInspection(HO_A, 'officer.b@croydon.gov.uk'), false)
    assert.equal(identityOwnsInspection(HO_A, 'recBBBB2222'), false)
    assert.equal(identityOwnsInspection(emptyOwnRecordIdentity(), 'officer.a@croydon.gov.uk'), false)
  })

  it('lets Housing Officer A access actions on their inspection or assigned to them by people id, email, or Airtable id', () => {
    assert.equal(
      identityCanAccessAction(HO_A, {
        inspectorId: 'officer.a@croydon.gov.uk',
        recipientPersonId: 'person-b',
      }),
      true
    )
    assert.equal(
      identityCanAccessAction(HO_A, {
        inspectorId: 'officer.b@croydon.gov.uk',
        recipientPersonId: 'person-a',
      }),
      true
    )
    assert.equal(
      identityCanAccessAction(HO_A, {
        inspectorId: 'officer.b@croydon.gov.uk',
        recipientPersonId: 'officer.a@croydon.gov.uk',
      }),
      true
    )
    assert.equal(
      identityCanAccessAction(HO_A, {
        inspectorId: 'officer.b@croydon.gov.uk',
        recipientPersonId: 'recAAAA1111',
      }),
      true
    )
    assert.equal(
      identityCanAccessAction(HO_A, {
        inspectorId: 'officer.b@croydon.gov.uk',
        recipientPersonId: 'person-b',
      }),
      false
    )
  })
})

describe('inspection list SQL', () => {
  it('restricts non-admin Housing Officer lists to their inspector match values', () => {
    const [sql, params] = joinSqlAnd(
      buildInspectionWhereConditions({
        completionScope: 'all',
        admin: false,
        fallbackInspectorIds: HO_A.inspectorMatchValues,
      })
    )
    assert.match(sql, /inspector_id/i)
    assert.match(sql, /ANY\(\$\d+::text\[\]\)/)
    assert.ok(params.some((value) => Array.isArray(value) && value.includes('officer.a@croydon.gov.uk')))
    assert.equal(
      params.some((value) => Array.isArray(value) && value.includes('officer.b@croydon.gov.uk')),
      false
    )
  })

  it('returns no rows when Housing Officer identity cannot be resolved', () => {
    const [sql] = joinSqlAnd(
      buildInspectionWhereConditions({
        completionScope: 'all',
        admin: false,
        fallbackInspectorIds: [],
      })
    )
    assert.match(sql, /FALSE/)
  })

  it('does not apply own-record inspector ANY for managers/admins', () => {
    const [sql, params] = joinSqlAnd(
      buildInspectionWhereConditions({
        completionScope: 'all',
        admin: true,
        inspector: 'officer.b@croydon.gov.uk',
        fallbackInspectorIds: HO_A.inspectorMatchValues,
      })
    )
    assert.equal(sql.includes('FALSE'), false)
    assert.ok(params.includes('officer.b@croydon.gov.uk'))
    assert.equal(
      params.some((value) => Array.isArray(value)),
      false
    )
  })
})

describe('issues list SQL', () => {
  it('scopes Housing Officer A to own inspections or assigned actions, not Housing Officer B', () => {
    const where = buildActionListWhere({
      status: 'all',
      includeFalseActions: true,
      ownRecord: HO_A,
    })
    assert.match(where.sql, /inspection_id IN \(SELECT id FROM inspections/)
    assert.match(where.sql, /recipient_person_id/)
    assert.deepEqual(where.params[0], HO_A.inspectorMatchValues)
    assert.deepEqual(where.params[1], HO_A.recipientMatchValues)
    assert.equal(where.sql.includes('officer.b@croydon.gov.uk'), false)
  })

  it('returns no actions when Housing Officer identity is empty', () => {
    const where = buildActionListWhere({
      status: 'all',
      includeFalseActions: true,
      ownRecord: emptyOwnRecordIdentity(),
    })
    assert.match(where.sql, /FALSE/)
    assert.equal(where.params.length, 0)
  })

  it('leaves manager/admin unscoped when ownRecord is omitted', () => {
    const where = buildActionListWhere({
      status: 'all',
      includeFalseActions: true,
    })
    assert.equal(where.sql.includes('inspector_id'), false)
    assert.equal(where.sql.includes('recipient_person_id'), false)
  })
})

describe('follow-up and by-id access', () => {
  it('blocks Housing Officer A from Housing Officer B inspection follow-up', () => {
    const roleCtx = { normalized: 'housing_officer', clerkIsAdmin: false }
    assert.equal(
      canViewInspectionFollowUpUpdates({
        roleCtx,
        userEmail: 'officer.a@croydon.gov.uk',
        inspection: { inspector_id: 'officer.b@croydon.gov.uk' },
        identity: HO_A,
      }),
      false
    )
    assert.equal(
      canViewInspectionFollowUpUpdates({
        roleCtx,
        userEmail: 'officer.a@croydon.gov.uk',
        inspection: { inspector_id: 'officer.a@croydon.gov.uk' },
        identity: HO_A,
      }),
      true
    )
  })

  it('blocks ESM and Housing Team Manager from another officer unless the record is theirs or their team', () => {
    const inspection = { inspector_id: 'officer.b@croydon.gov.uk' }
    assert.equal(
      canViewInspectionFollowUpUpdates({
        roleCtx: { normalized: 'esm', clerkIsAdmin: false },
        userEmail: 'esm@croydon.gov.uk',
        inspection,
        identity: HO_A,
      }),
      false
    )
    assert.equal(
      canViewInspectionFollowUpUpdates({
        roleCtx: { normalized: 'housing_team_manager', clerkIsAdmin: false },
        userEmail: 'manager@croydon.gov.uk',
        inspection,
        identity: emptyOwnRecordIdentity(),
      }),
      false
    )
    assert.equal(
      canViewInspectionFollowUpUpdates({
        roleCtx: { normalized: 'admin', systemRole: 'admin', clerkIsAdmin: false },
        userEmail: 'admin@croydon.gov.uk',
        inspection,
      }),
      true
    )
  })

  it('lets a team member view a teammate inspection follow-up', () => {
    const teamIdentity = expandIdentityWithTeamAccess(HO_A, ['officer.b@croydon.gov.uk'])
    assert.equal(
      canViewInspectionFollowUpUpdates({
        roleCtx: { normalized: 'housing_team_manager', clerkIsAdmin: false },
        userEmail: 'officer.a@croydon.gov.uk',
        inspection: { inspector_id: 'officer.b@croydon.gov.uk' },
        identity: teamIdentity,
      }),
      true
    )
  })
})

describe('team permissions', () => {
  const teams = [
    {
      id: 'team-north',
      managerPersonId: 'person-manager',
      members: [
        { personId: 'person-a', email: 'officer.a@croydon.gov.uk', matchValues: ['person-a', 'officer.a@croydon.gov.uk'] },
        { personId: 'person-b', email: 'officer.b@croydon.gov.uk', matchValues: ['person-b', 'officer.b@croydon.gov.uk'] },
      ],
    },
  ]

  it('includes teammates for a member and a manager, and nobody else', () => {
    assert.ok(teamInspectorMatchValuesForViewer(teams, HO_A).includes('officer.b@croydon.gov.uk'))
    const manager = buildOwnRecordIdentity({ peopleIds: ['person-manager'], emails: ['manager@croydon.gov.uk'] })
    assert.ok(teamInspectorMatchValuesForViewer(teams, manager).includes('officer.b@croydon.gov.uk'))
    const outsider = buildOwnRecordIdentity({ peopleIds: ['person-c'], emails: ['other@croydon.gov.uk'] })
    assert.deepEqual(teamInspectorMatchValuesForViewer(teams, outsider), [])
  })
})

describe('operational record decisions', () => {
  const ownAction = { inspector_id: 'officer.a@croydon.gov.uk', recipient_person_id: 'person-b', category: 'cleaning' }
  const assignedAction = { inspector_id: 'officer.b@croydon.gov.uk', recipient_person_id: 'person-a', category: 'cleaning' }
  const otherAction = { inspector_id: 'officer.b@croydon.gov.uk', recipient_person_id: 'person-b', category: 'repairs' }
  const mailboxRepairs = { recipient_person_id: 'recipient_repairs', category: 'health_safety' }
  const unassignedRepairs = { recipient_person_id: '', category: 'repairs' }
  const otherTeamRepairs = { recipient_person_id: 'recipient_fire', category: 'repairs' }

  it('lets owners and admins view and update any action', () => {
    assert.equal(canAccessOperationalAction({ privileged: true, action: otherAction }), true)
    assert.equal(canAccessOperationalInspection({ privileged: true, inspectorId: 'officer.b@croydon.gov.uk' }), true)
  })

  it('lets another user view and update their own inspection, its actions, and actions assigned to them', () => {
    assert.equal(canAccessOperationalInspection({ identity: HO_A, inspectorId: 'officer.a@croydon.gov.uk' }), true)
    assert.equal(canAccessOperationalAction({ identity: HO_A, action: ownAction }), true)
    assert.equal(canAccessOperationalAction({ identity: HO_A, action: assignedAction }), true)
  })

  it('blocks another user from someone else’s inspection and action', () => {
    assert.equal(canAccessOperationalInspection({ identity: HO_A, inspectorId: 'officer.b@croydon.gov.uk' }), false)
    assert.equal(canAccessOperationalAction({ identity: HO_A, action: otherAction }), false)
    assert.equal(canAccessOperationalAction({ identity: emptyOwnRecordIdentity(), action: otherAction }), false)
  })

  it('lets a team member view a teammate inspection and its action, not an outside assignment', () => {
    const teamIdentity = expandIdentityWithTeamAccess(HO_A, teamInspectorMatchValuesForViewer(
      [{
        id: 'team-north',
        members: [
          { personId: 'person-a', email: 'officer.a@croydon.gov.uk' },
          { personId: 'person-b', email: 'officer.b@croydon.gov.uk' },
        ],
      }],
      HO_A
    ))
    assert.equal(canAccessOperationalInspection({ identity: teamIdentity, inspectorId: 'officer.b@croydon.gov.uk' }), true)
    assert.equal(canAccessOperationalAction({ identity: teamIdentity, action: otherAction }), true)
    assert.equal(
      canAccessOperationalAction({
        identity: teamIdentity,
        action: { inspector_id: 'officer.c@croydon.gov.uk', recipient_person_id: 'person-c', category: 'repairs' },
      }),
      false
    )
  })

  it('keeps Repairs Contact inside the existing queue and blocks every inspection', () => {
    assert.equal(
      canAccessOperationalAction({ repairsContact: true, mailboxId: 'recipient_repairs', action: mailboxRepairs }),
      true
    )
    assert.equal(
      canAccessOperationalAction({ repairsContact: true, mailboxId: 'recipient_repairs', action: unassignedRepairs }),
      true
    )
    assert.equal(
      canAccessOperationalAction({ repairsContact: true, mailboxId: 'recipient_repairs', action: otherTeamRepairs }),
      false
    )
    assert.equal(
      canAccessOperationalAction({ repairsContact: true, mailboxId: 'recipient_repairs', action: { recipient_person_id: '', category: 'cleaning' } }),
      false
    )
    assert.equal(canAccessOperationalInspection({ repairsContact: true, inspectorId: 'officer.a@croydon.gov.uk' }), false)
    assert.equal(
      canAccessOperationalAction({ privileged: true, repairsContact: true, mailboxId: 'recipient_repairs', action: otherTeamRepairs }),
      true
    )
  })

  it('scopes list and download SQL to the viewer and matches nothing when identity is empty', () => {
    const visible = operationalActionVisibilitySql(HO_A)
    assert.match(visible.sql, /i\.inspector_id/)
    assert.match(visible.sql, /a\.recipient_person_id/)
    assert.deepEqual(visible.params[0], HO_A.inspectorMatchValues)
    assert.equal(operationalActionVisibilitySql(emptyOwnRecordIdentity()).sql, 'FALSE')
  })
})

describe('server routes keep the record check', () => {
  it('checks action IDs, the repairs list, photos, and report downloads on the server', () => {
    const actionRoute = readFileSync(new URL('../app/api/actions/[id]/route.js', import.meta.url), 'utf8')
    const listRoute = readFileSync(new URL('../app/api/actions/route.js', import.meta.url), 'utf8')
    const repairsList = readFileSync(new URL('../app/api/repairs-inspector/actions/route.js', import.meta.url), 'utf8')
    const photos = readFileSync(new URL('../app/api/actions/[id]/photos/route.js', import.meta.url), 'utf8')
    const zip = readFileSync(new URL('../app/api/inspections/report-pdfs-zip/route.js', import.meta.url), 'utf8')
    assert.match(actionRoute, /ownRecordActionForbidden/)
    assert.match(actionRoute, /actionInRepairsQueue/)
    assert.match(actionRoute, /repairsProgressRejection/)
    assert.match(listRoute, /loadScopedOperationalIdentity/)
    assert.match(repairsList, /operationalActionVisibilitySql/)
    assert.match(repairsList, /isRepairsContactAccess/)
    assert.match(photos, /actionInRepairsQueue/)
    assert.match(zip, /partitionBulkPdfAccess/)
  })
})
