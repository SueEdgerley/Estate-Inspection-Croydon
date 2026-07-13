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
  queryUsesSeparateActionDates,
  reconcilePersonAfterRoleChange,
  resolveInspectionDatesFromClientState,
  applyCustomInspectionDate,
} from '../lib/analytics-client-filters.js'
import {
  buildAnalyticsFilterArgs,
  prepareAnalyticsEffectiveParams,
} from '../lib/analytics-filters.js'
import { buildInspectionWhereConditions, joinSqlAnd } from '../lib/inspection-filters.js'
import { resolveAnalyticsPresetDates } from '../lib/analytics-date-presets.js'

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

  it('selecting a named person adds the person parameter to the request', () => {
    const qs = buildAnalyticsQueryString({ preset: 'month', personRole: 'all', person: PALMA })
    assert.match(qs, /person=/)
    assert.match(qs, /palma\.muriel/)
  })

  it('a person invalid for the new role is cleared', () => {
    assert.equal(reconcilePersonAfterRoleChange('caretaker', PALMA, PEOPLE), 'all')
    assert.equal(reconcilePersonAfterRoleChange('esm', PALMA, PEOPLE), PALMA)
  })
})

describe('inspection period dates', () => {
  it('This month uses the current-month inspection dates', () => {
    const state = { preset: 'month', quarter: '2', year: '2026', customFrom: '', customTo: '' }
    const resolved = resolveInspectionDatesFromClientState(state)
    const today = new Date()
    const monthPrefix = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}`
    assert.equal(resolved.preset, 'month')
    assert.match(resolved.dateFrom, new RegExp(`^${monthPrefix}`))
  })

  it('manual inspection dates switch Period to Custom', () => {
    const next = applyCustomInspectionDate({ preset: 'month' }, 'customFrom', '2026-06-01')
    assert.equal(next.preset, 'custom')
    assert.equal(next.customFrom, '2026-06-01')
  })

  it('manual inspection dates are sent only when Period is Custom', () => {
    const customQs = buildAnalyticsQueryString({
      preset: 'custom',
      customFrom: '2026-06-01',
      customTo: '2026-06-30',
    })
    assert.match(customQs, /dateFrom=2026-06-01/)
    assert.match(customQs, /dateTo=2026-06-30/)

    const monthQs = buildAnalyticsQueryString({
      preset: 'month',
      customFrom: '2026-06-01',
      customTo: '2026-06-30',
    })
    assert.doesNotMatch(monthQs, /dateFrom=/)
    assert.doesNotMatch(monthQs, /dateTo=/)
  })

  it('the active-window banner matches the actual query inspection dates', () => {
    const state = {
      preset: 'custom',
      customFrom: '2026-06-01',
      customTo: '2026-06-30',
      personRole: 'all',
      person: 'all',
    }
    const qs = buildAnalyticsQueryString(state)
    const serverDates = resolveAnalyticsPresetDates(new URLSearchParams(qs))
    const banner = buildAppliedBannerFromClientState(state)
    assert.equal(banner.dateFrom, serverDates.dateFrom)
    assert.equal(banner.dateTo, serverDates.dateTo)
    assert.equal(banner.preset, 'Custom')
  })

  it('action-date filters remain separate from inspection-date filters', () => {
    const qs = buildAnalyticsQueryString({
      preset: 'month',
      issueDateFrom: '2026-06-01',
      issueDateTo: '2026-06-30',
    })
    const split = queryUsesSeparateActionDates(qs)
    assert.equal(split.preset, 'month')
    assert.equal(split.hasActionDates, true)
    assert.equal(split.hasCustomInspectionDates, false)
    assert.match(qs, /issueDateFrom=2026-06-01/)
    assert.doesNotMatch(qs, /dateFrom=/)
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
    assert.equal(banner.dateFrom, '2026-06-01')
    assert.equal(banner.dateTo, '2026-06-30')
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
