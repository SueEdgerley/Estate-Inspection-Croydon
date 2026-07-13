/**
 * Tests for Analytics fetch sequencing — stale responses and Apply-only policy.
 * Run: npm run test:analytics-load-guard
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { AnalyticsFetchSession, createAnalyticsLoadGuard } from '../lib/analytics-load-guard.js'
import {
  buildAnalyticsFilterArgs,
  prepareAnalyticsEffectiveParams,
} from '../lib/analytics-filters.js'
import { buildInspectionWhereConditions, joinSqlAnd } from '../lib/inspection-filters.js'

const GROUNDS_MAINTENANCE = 'Grounds Maintenance'
const PALMA = 'palma.muriel@croydon.gov.uk'

function responseFor(filters, completedCount) {
  const params = new URLSearchParams(filters)
  const { eff } = prepareAnalyticsEffectiveParams(params, true)
  const appliedForm =
    (eff.get('gradeTemplateName') || 'all') !== 'all' ? eff.get('gradeTemplateName') : null
  return {
    applied: {
      preset: params.get('preset') || 'custom',
      dateFrom: params.get('dateFrom') || null,
      dateTo: params.get('dateTo') || null,
      person: params.get('person') || null,
      gradeTemplateName: appliedForm,
    },
    overview: { completedInspections: completedCount },
  }
}

describe('createAnalyticsLoadGuard', () => {
  it('accepts only the latest request sequence', () => {
    const guard = createAnalyticsLoadGuard()
    const first = guard.nextRequest()
    const second = guard.nextRequest()
    assert.equal(guard.isCurrentRequest(first), false)
    assert.equal(guard.isCurrentRequest(second), true)
  })
})

describe('AnalyticsFetchSession — out-of-order responses', () => {
  it('older unfiltered request finishing after newer Form-filtered request', () => {
    const session = new AnalyticsFetchSession()
    const unfiltered = session.startFetch('apply')
    const withForm = session.startFetch('apply')

    const formResponse = responseFor(
      {
        preset: 'custom',
        dateFrom: '2026-06-01',
        dateTo: '2026-06-30',
        gradeTemplateName: GROUNDS_MAINTENANCE,
      },
      0
    )
    const unfilteredResponse = responseFor(
      { preset: 'custom', dateFrom: '2026-06-01', dateTo: '2026-06-30' },
      416
    )

    assert.equal(session.acceptResponse(withForm.seq, formResponse), true)
    assert.equal(session.acceptResponse(unfiltered.seq, unfilteredResponse), false)
    assert.equal(session.payload.overview.completedInspections, 0)
    assert.equal(session.payload.applied.gradeTemplateName, GROUNDS_MAINTENANCE)
  })

  it('older Person-only request finishing after newer Person + Form request', () => {
    const session = new AnalyticsFetchSession()
    const personOnly = session.startFetch('apply')
    const personAndForm = session.startFetch('apply')

    const combined = responseFor(
      {
        preset: 'custom',
        dateFrom: '2026-06-01',
        dateTo: '2026-07-30',
        person: PALMA,
        gradeTemplateName: GROUNDS_MAINTENANCE,
      },
      21
    )
    const personOnlyResponse = responseFor(
      {
        preset: 'custom',
        dateFrom: '2026-06-01',
        dateTo: '2026-07-30',
        person: PALMA,
      },
      42
    )

    assert.equal(session.acceptResponse(personAndForm.seq, combined), true)
    assert.equal(session.acceptResponse(personOnly.seq, personOnlyResponse), false)
    assert.equal(session.payload.overview.completedInspections, 21)
    assert.equal(session.payload.applied.gradeTemplateName, GROUNDS_MAINTENANCE)
    assert.equal(session.payload.applied.person, PALMA)
  })
})

describe('AnalyticsFetchSession — Apply-only fetch policy', () => {
  it('multiple filter changes do not fetch until Apply', () => {
    const session = new AnalyticsFetchSession()
    session.triggerInitialLoad()
    assert.equal(session.fetchCount, 1)

    session.onFilterFieldChange()
    session.onFilterFieldChange()
    session.onFilterFieldChange()
    assert.equal(session.fetchCount, 1)

    session.triggerApply()
    assert.equal(session.fetchCount, 2)
  })

  it('banner and figures share the same accepted payload', () => {
    const session = new AnalyticsFetchSession()
    const { seq } = session.triggerApply()
    const body = responseFor(
      {
        preset: 'custom',
        dateFrom: '2026-06-01',
        dateTo: '2026-07-31',
        gradeTemplateName: GROUNDS_MAINTENANCE,
      },
      21
    )
    session.acceptResponse(seq, body)
    assert.equal(session.payload.applied.gradeTemplateName, GROUNDS_MAINTENANCE)
    assert.equal(session.payload.overview.completedInspections, 21)
  })
})

describe('live DB expectations — Grounds Maintenance counts', () => {
  function countFor(filters) {
    const params = new URLSearchParams(filters)
    const { eff, filterAsAdmin } = prepareAnalyticsEffectiveParams(params, true)
    const args = buildAnalyticsFilterArgs(eff, filterAsAdmin)
    const [where, sqlParams] = joinSqlAnd(buildInspectionWhereConditions(args))
    return { where, sqlParams, appliedForm: args.templateName }
  }

  it('June 2026 + Grounds Maintenance filter args and applied form label', () => {
    const filters = {
      preset: 'custom',
      dateFrom: '2026-06-01',
      dateTo: '2026-06-30',
      gradeTemplateName: GROUNDS_MAINTENANCE,
    }
    const { appliedForm } = countFor(filters)
    assert.equal(appliedForm, GROUNDS_MAINTENANCE)
    const session = new AnalyticsFetchSession()
    const { seq } = session.triggerApply()
    session.acceptResponse(seq, responseFor(filters, 0))
    assert.equal(session.payload.applied.gradeTemplateName, 'Grounds Maintenance')
    assert.equal(session.payload.overview.completedInspections, 0)
  })

  it('Jun–Jul 2026 + Grounds Maintenance = 21 when DB returns 21', () => {
    const filters = {
      preset: 'custom',
      dateFrom: '2026-06-01',
      dateTo: '2026-07-31',
      gradeTemplateName: GROUNDS_MAINTENANCE,
    }
    const session = new AnalyticsFetchSession()
    const { seq } = session.triggerApply()
    session.acceptResponse(seq, responseFor(filters, 21))
    assert.equal(session.payload.overview.completedInspections, 21)
    assert.equal(session.payload.applied.gradeTemplateName, GROUNDS_MAINTENANCE)
  })
})
