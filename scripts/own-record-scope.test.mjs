/**
 * Housing Officer own-record access: roles, identity matching, list SQL.
 * Run: node --import ./scripts/esm-alias-register.mjs --test scripts/own-record-scope.test.mjs
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildOwnRecordIdentity,
  emptyOwnRecordIdentity,
  identityCanAccessAction,
  identityOwnsInspection,
  roleMustScopeToOwnOperationalRecords,
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
  it('scopes Housing Officer only', () => {
    assert.equal(roleMustScopeToOwnOperationalRecords('housing_officer', false), true)
  })

  it('does not scope other operational roles or privileged admins', () => {
    assert.equal(roleMustScopeToOwnOperationalRecords('caretaker', false), false)
    assert.equal(roleMustScopeToOwnOperationalRecords('esm', false), false)
    assert.equal(roleMustScopeToOwnOperationalRecords('housing_team_manager', false), false)
    assert.equal(roleMustScopeToOwnOperationalRecords('resident', false), false)
    assert.equal(roleMustScopeToOwnOperationalRecords('repairs_inspector', false), false)
    assert.equal(roleMustScopeToOwnOperationalRecords('neighbourhood_voice', false), false)
    assert.equal(roleMustScopeToOwnOperationalRecords('admin', false), false)
    assert.equal(roleMustScopeToOwnOperationalRecords('owner', false), false)
    assert.equal(roleMustScopeToOwnOperationalRecords('housing_officer', true), false)
  })
})

describe('getRoleUiFlags own-record flag', () => {
  it('hides officer filter for Housing Officer and not for manager/admin/others', () => {
    assert.equal(getRoleUiFlags('user', false, 'Housing Officer').mustScopeToOwnRecords, true)
    assert.equal(getRoleUiFlags('admin', false, 'Housing Officer').mustScopeToOwnRecords, false)
    assert.equal(getRoleUiFlags('user', true, 'Housing Officer').mustScopeToOwnRecords, false)
    assert.equal(getRoleUiFlags('user', false, 'Housing Team Manager').mustScopeToOwnRecords, false)
    assert.equal(getRoleUiFlags('user', false, 'Caretaker').mustScopeToOwnRecords, false)
    assert.equal(getRoleUiFlags('user', false, 'ESM').mustScopeToOwnRecords, false)
    assert.equal(getRoleUiFlags('user', false, 'Resident').mustScopeToOwnRecords, false)
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

  it('still lets ESM, HTM, and admin view another officer inspection follow-up', () => {
    const inspection = { inspector_id: 'officer.b@croydon.gov.uk' }
    assert.equal(
      canViewInspectionFollowUpUpdates({
        roleCtx: { normalized: 'esm', clerkIsAdmin: false },
        userEmail: 'esm@croydon.gov.uk',
        inspection,
      }),
      true
    )
    assert.equal(
      canViewInspectionFollowUpUpdates({
        roleCtx: { normalized: 'housing_team_manager', clerkIsAdmin: false },
        userEmail: 'manager@croydon.gov.uk',
        inspection,
      }),
      true
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
})
