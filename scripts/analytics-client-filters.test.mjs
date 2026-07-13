/**
 * Tests for Analytics client filter state ↔ query string ↔ banner sync.
 * Run: npm run test:analytics-client-filters
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildAnalyticsQueryString,
  buildAppliedBannerFromClientState,
  captureClientFilterState,
  clientFiltersEqual,
  filterPeopleOptions,
  queryHasNoRoleOrPersonParams,
} from '../lib/analytics-client-filters.js'
import {
  buildAnalyticsFilterArgs,
  prepareAnalyticsEffectiveParams,
} from '../lib/analytics-filters.js'
import { buildInspectionWhereConditions, joinSqlAnd } from '../lib/inspection-filters.js'

const GROUNDS_MAINTENANCE = 'Grounds Maintenance'
const PALMA = 'palma.muriel@croydon.gov.uk'

const PEOPLE = [
  { value: 'a@croydon.gov.uk', label: 'Alice', role: 'esm' },
  { value: 'b@croydon.gov.uk', label: 'Bob', role: 'caretaker' },
  { value: PALMA, label: 'Palma Muriel', role: 'esm' },
]

describe('buildAnalyticsQueryString — clearing role and person', () => {
  it('All roles + All people + Grounds Maintenance sends no role or person parameter', () => {
    const qs = buildAnalyticsQueryString({
      preset: 'custom',
      customFrom: '2026-06-01',
      customTo: '2026-06-30',
      personRole: 'all',
      person: 'all',
      gradeTemplateName: GROUNDS_MAINTENANCE,
    })
    assert.match(qs, /gradeTemplateName=Grounds/)
    assert.match(qs, /dateFrom=2026-06-01/)
    assert.ok(queryHasNoRoleOrPersonParams(qs))
    assert.doesNotMatch(qs, /personRole=/)
    assert.doesNotMatch(qs, /person=/)
  })

  it('ESMs → All roles clears the role filter from the query string', () => {
    const before = buildAnalyticsQueryString({ preset: 'custom', personRole: 'esm' })
    assert.match(before, /personRole=esm/)

    const after = buildAnalyticsQueryString({ preset: 'custom', personRole: 'all', person: 'all' })
    assert.ok(queryHasNoRoleOrPersonParams(after))
  })

  it('Named person → All people clears the person filter from the query string', () => {
    const before = buildAnalyticsQueryString({ preset: 'custom', person: PALMA })
    assert.match(before, /person=/)
    const after = buildAnalyticsQueryString({ preset: 'custom', personRole: 'all', person: 'all' })
    assert.ok(queryHasNoRoleOrPersonParams(after))
  })
})

describe('prepareAnalyticsEffectiveParams — stale URL keys', () => {
  it('old role=esm without personRole is cleared when client sends no role params', () => {
    const raw = new URLSearchParams('preset=custom&dateFrom=2026-06-01&dateTo=2026-06-30&role=esm')
    const { eff, selectedRole } = prepareAnalyticsEffectiveParams(raw, true)
    assert.equal(selectedRole, 'esm')
    assert.equal(eff.get('role'), 'esm')

    const cleared = new URLSearchParams('preset=custom&dateFrom=2026-06-01&dateTo=2026-06-30')
    const next = prepareAnalyticsEffectiveParams(cleared, true)
    assert.equal(next.selectedRole, 'all')
    assert.equal(next.eff.get('role'), null)
    assert.equal(next.eff.get('personRole'), null)
  })

  it('old URL role parameters do not override newly applied All roles controls', () => {
    const qs = buildAnalyticsQueryString({
      preset: 'custom',
      customFrom: '2026-06-01',
      customTo: '2026-06-30',
      personRole: 'all',
      person: 'all',
      gradeTemplateName: GROUNDS_MAINTENANCE,
    })
    const { eff, selectedRole, selectedPerson } = prepareAnalyticsEffectiveParams(
      new URLSearchParams(qs),
      true
    )
    assert.equal(selectedRole, 'all')
    assert.equal(selectedPerson, 'all')
    assert.equal(eff.get('role'), null)
    assert.equal(eff.get('personRole'), null)
    assert.equal(eff.get('person'), null)
    assert.equal(eff.get('inspector'), null)

    const args = buildAnalyticsFilterArgs(eff, true)
    assert.equal(args.role, 'all')
    assert.equal(args.inspector, 'all')
    const [where] = joinSqlAnd(buildInspectionWhereConditions(args))
    assert.doesNotMatch(where, /work_type/)
  })
})

describe('filterPeopleOptions — role change refreshes people list', () => {
  it('All roles shows every person', () => {
    assert.equal(filterPeopleOptions(PEOPLE, 'all').length, 3)
  })

  it('ESMs role limits people to ESM inspectors', () => {
    const esmOnly = filterPeopleOptions(PEOPLE, 'esm')
    assert.equal(esmOnly.length, 2)
    assert.ok(esmOnly.every((p) => p.role === 'esm'))
  })

  it('changing role from esm to all expands the people dropdown again', () => {
    const esmOnly = filterPeopleOptions(PEOPLE, 'esm')
    const allPeople = filterPeopleOptions(PEOPLE, 'all')
    assert.ok(allPeople.length > esmOnly.length)
  })
})

describe('banner matches last applied client state', () => {
  it('All roles + Grounds Maintenance banner has Form but no Role', () => {
    const state = captureClientFilterState({
      preset: 'custom',
      customFrom: '2026-06-01',
      customTo: '2026-06-30',
      personRole: 'all',
      person: 'all',
      gradeTemplateName: GROUNDS_MAINTENANCE,
    })
    const banner = buildAppliedBannerFromClientState(state)
    assert.equal(banner.gradeTemplateName, GROUNDS_MAINTENANCE)
    assert.equal(banner.personRoleLabel, null)
    assert.equal(banner.person, null)
  })

  it('clientFiltersEqual detects pending role change before Apply', () => {
    const applied = captureClientFilterState({ preset: 'custom', personRole: 'esm', person: 'all' })
    const controls = captureClientFilterState({ preset: 'custom', personRole: 'all', person: 'all' })
    assert.equal(clientFiltersEqual(applied, controls), false)
  })
})

describe('server filter args for All roles + All people + Grounds Maintenance', () => {
  it('does not add work_type or inspector predicates', () => {
    const qs = buildAnalyticsQueryString({
      preset: 'custom',
      customFrom: '2026-06-01',
      customTo: '2026-06-30',
      personRole: 'all',
      person: 'all',
      gradeTemplateName: GROUNDS_MAINTENANCE,
    })
    const { eff, filterAsAdmin } = prepareAnalyticsEffectiveParams(new URLSearchParams(qs), true)
    const args = buildAnalyticsFilterArgs(eff, filterAsAdmin)
    const [where, params] = joinSqlAnd(buildInspectionWhereConditions(args))
    assert.match(where, /template_name/)
    assert.ok(params.includes(GROUNDS_MAINTENANCE))
    assert.doesNotMatch(where, /work_type/)
    assert.doesNotMatch(where, /inspector_id/)
  })
})
