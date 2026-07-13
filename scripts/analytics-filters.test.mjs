/**
 * Unit tests for Analytics filter pipeline (Person, Form, Date, Block, Area → AND logic).
 * Run: npm run test:analytics-filters
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildAnalyticsFilterArgs,
  prepareAnalyticsEffectiveParams,
  buildAnalyticsCompletedWhere,
} from '../lib/analytics-filters.js'
import { buildInspectionWhereConditions, joinSqlAnd } from '../lib/inspection-filters.js'

const PALMA = 'palma.muriel@croydon.gov.uk'
const GROUNDS_MAINTENANCE = 'Grounds Maintenance'

function searchParams(obj) {
  const p = new URLSearchParams()
  for (const [key, value] of Object.entries(obj)) {
    if (value != null && value !== '') p.set(key, String(value))
  }
  return p
}

function completedWhereFromUiParams(obj, admin = true) {
  const raw = searchParams(obj)
  const { eff, filterAsAdmin } = prepareAnalyticsEffectiveParams(raw, admin)
  const args = buildAnalyticsFilterArgs(eff, filterAsAdmin)
  return joinSqlAnd(buildInspectionWhereConditions(args))
}

function parseSubmittedAt(value) {
  if (!value) return null
  const normalized = value.includes('T') ? value : `${value}T12:00:00`
  return new Date(normalized)
}

/** JS mirror of completed-inspection filter args for mock counting. */
function matchesCompletedFilter(inspection, filterArgs, estatesById = new Map()) {
  const status = String(inspection.status || '').trim().toLowerCase()
  if (!inspection.submitted_at && status !== 'submitted') return false

  if (filterArgs.dateFrom) {
    const submitted = parseSubmittedAt(inspection.submitted_at)
    const from = new Date(`${filterArgs.dateFrom}T00:00:00`)
    if (!submitted || submitted < from) return false
  }
  if (filterArgs.dateTo) {
    const submitted = parseSubmittedAt(inspection.submitted_at)
    const endToken =
      filterArgs.dateTo.length <= 10 ? `${filterArgs.dateTo} 23:59:59` : filterArgs.dateTo
    const to = new Date(endToken.replace(' ', 'T'))
    if (!submitted || submitted > to) return false
  }

  if (filterArgs.templateName) {
    if (String(inspection.template_name || '').trim() !== String(filterArgs.templateName).trim()) {
      return false
    }
  }

  if (filterArgs.admin && filterArgs.inspector && filterArgs.inspector !== 'all') {
    const want = String(filterArgs.inspector).trim().toLowerCase()
    const got = String(inspection.inspector_id || '').trim().toLowerCase()
    if (got !== want) return false
  }

  if (filterArgs.blockId) {
    if (inspection.block_id !== filterArgs.blockId) return false
  }

  if (filterArgs.estateArea) {
    const estate = estatesById.get(inspection.estate_id)
    const area = String(estate?.area || '').trim().toLowerCase()
    if (area !== String(filterArgs.estateArea).trim().toLowerCase()) return false
  }

  return true
}

function countMockInspections(uiParams, inspections, admin = true) {
  const raw = searchParams(uiParams)
  const { eff, filterAsAdmin } = prepareAnalyticsEffectiveParams(raw, admin)
  const args = buildAnalyticsFilterArgs(eff, filterAsAdmin)
  return inspections.filter((row) => matchesCompletedFilter(row, args)).length
}

const palmaFixture = [
  ...Array.from({ length: 42 }, (_, index) => ({
    id: `walkabout-${index}`,
    inspector_id: PALMA,
    template_name: 'Estate Walkabout',
    submitted_at: '2026-07-10',
    status: 'submitted',
  })),
  ...['2026-06-05', '2026-06-15', '2026-07-01', '2026-07-15', '2026-07-20'].map((date, index) => ({
    id: `gm-${index}`,
    inspector_id: PALMA,
    template_name: GROUNDS_MAINTENANCE,
    submitted_at: date,
    status: 'submitted',
  })),
]

describe('buildAnalyticsFilterArgs maps UI form/block/area into inspection filters', () => {
  it('maps gradeTemplateName to templateName', () => {
    const args = buildAnalyticsFilterArgs(
      searchParams({ gradeTemplateName: GROUNDS_MAINTENANCE }),
      true
    )
    assert.equal(args.templateName, GROUNDS_MAINTENANCE)
  })

  it('maps gradeBlockId and gradeArea', () => {
    const args = buildAnalyticsFilterArgs(
      searchParams({ gradeBlockId: 'blk-1', gradeArea: 'South' }),
      true
    )
    assert.equal(args.blockId, 'blk-1')
    assert.equal(args.estateArea, 'South')
  })
})

describe('Analytics WHERE clause — filter combinations use AND logic', () => {
  it('person only', () => {
    const [where, params] = completedWhereFromUiParams({ person: PALMA })
    assert.match(where, /inspector_id/i)
    assert.ok(params.includes(PALMA))
    assert.doesNotMatch(where, /template_name/i)
  })

  it('form only', () => {
    const [where, params] = completedWhereFromUiParams({ gradeTemplateName: GROUNDS_MAINTENANCE })
    assert.match(where, /template_name/i)
    assert.ok(params.includes(GROUNDS_MAINTENANCE))
    assert.doesNotMatch(where, /inspector_id/i)
  })

  it('date only', () => {
    const [where, params] = completedWhereFromUiParams({
      dateFrom: '2026-06-01',
      dateTo: '2026-06-30',
    })
    assert.match(where, /submitted_at/i)
    assert.ok(params.includes('2026-06-01'))
    assert.ok(params.includes('2026-06-30 23:59:59'))
  })

  it('person + form', () => {
    const [where, params] = completedWhereFromUiParams({
      person: PALMA,
      gradeTemplateName: GROUNDS_MAINTENANCE,
    })
    assert.match(where, /inspector_id/i)
    assert.match(where, /template_name/i)
    assert.ok(params.includes(PALMA))
    assert.ok(params.includes(GROUNDS_MAINTENANCE))
  })

  it('person + form + date', () => {
    const [where, params] = completedWhereFromUiParams({
      person: PALMA,
      gradeTemplateName: GROUNDS_MAINTENANCE,
      dateFrom: '2026-06-01',
      dateTo: '2026-07-30',
    })
    assert.match(where, /inspector_id/i)
    assert.match(where, /template_name/i)
    assert.match(where, /submitted_at/i)
    assert.equal(params.filter((p) => p === PALMA).length, 1)
    assert.equal(params.filter((p) => p === GROUNDS_MAINTENANCE).length, 1)
  })

  it('no filters — completed scope only', () => {
    const [where, params] = completedWhereFromUiParams({})
    assert.match(where, /submitted_at|status/i)
    assert.equal(params.length, 0)
    assert.doesNotMatch(where, /template_name/i)
    assert.doesNotMatch(where, /inspector_id/i)
  })
})

describe('Palma Muriel + Grounds Maintenance + date window', () => {
  it('returns only Grounds Maintenance submissions, not all 42 walkabouts', () => {
    const count = countMockInspections(
      {
        person: PALMA,
        gradeTemplateName: GROUNDS_MAINTENANCE,
        dateFrom: '2026-06-01',
        dateTo: '2026-07-30',
      },
      palmaFixture
    )
    assert.equal(count, 5)
    assert.notEqual(count, 42)
  })

  it('June-only window returns June Grounds Maintenance only', () => {
    const count = countMockInspections(
      {
        person: PALMA,
        gradeTemplateName: GROUNDS_MAINTENANCE,
        dateFrom: '2026-06-01',
        dateTo: '2026-06-30',
      },
      palmaFixture
    )
    assert.equal(count, 2)
  })
})

describe('buildAnalyticsCompletedWhere', () => {
  it('exposes the same completed WHERE as the filter pipeline', () => {
    const params = {
      person: PALMA,
      gradeTemplateName: GROUNDS_MAINTENANCE,
      dateFrom: '2026-06-01',
      dateTo: '2026-07-30',
    }
    const fromHelper = buildAnalyticsCompletedWhere(searchParams(params), true)
    const fromParts = completedWhereFromUiParams(params, true)
    assert.deepEqual(fromHelper, fromParts)
  })
})

/** Shape and values verified against production DB on 2026-07-13. */
const DB_REALITY_FIXTURE = [
  ...Array.from({ length: 318 }, (_, index) => ({
    id: `caretaker-june-${index}`,
    inspector_id: `caretaker${index}@croydon.gov.uk`,
    template_name: 'Caretaker Inspection',
    type: 'inspection',
    template_id: 'recfCSreXsVPKZFux',
    submitted_at: '2026-06-15',
    status: 'submitted',
  })),
  ...Array.from({ length: 90 }, (_, index) => ({
    id: `walkabout-june-${index}`,
    inspector_id: `officer${index}@croydon.gov.uk`,
    template_name: 'Estate Walkabout',
    type: 'estate_walkabout',
    template_id: 'tpl_estate_walkabout_v1',
    submitted_at: '2026-06-20',
    status: 'submitted',
  })),
  ...Array.from({ length: 8 }, (_, index) => ({
    id: `esm-june-${index}`,
    inspector_id: `esm${index}@croydon.gov.uk`,
    template_name: 'ESM Inspection Form',
    type: 'inspection',
    template_id: 'recbBNZKtfSXPTjkt',
    submitted_at: '2026-06-10',
    status: 'submitted',
  })),
  ...Array.from({ length: 21 }, (_, index) => ({
    id: `gm-july-${index}`,
    inspector_id: 'palma.muriel@croydon.gov.uk',
    template_name: 'Grounds Maintenance',
    type: 'inspection',
    template_id: 'recMOQSaY7Z16SYDM',
    submitted_at: `2026-07-${String(1 + (index % 10)).padStart(2, '0')}`,
    status: 'submitted',
  })),
]

describe('integration — production DB-shaped records (submitted_at semantics)', () => {
  it('June all people all forms returns 416 completed rows', () => {
    const count = countMockInspections(
      { preset: 'custom', dateFrom: '2026-06-01', dateTo: '2026-06-30' },
      DB_REALITY_FIXTURE
    )
    assert.equal(count, 416)
  })

  it('June all people + Grounds Maintenance returns 0 (no GM submitted in June)', () => {
    const count = countMockInspections(
      {
        preset: 'custom',
        dateFrom: '2026-06-01',
        dateTo: '2026-06-30',
        gradeTemplateName: GROUNDS_MAINTENANCE,
      },
      DB_REALITY_FIXTURE
    )
    assert.equal(count, 0)
  })

  it('Jun–Jul all people + Grounds Maintenance returns 21', () => {
    const count = countMockInspections(
      {
        preset: 'custom',
        dateFrom: '2026-06-01',
        dateTo: '2026-07-30',
        gradeTemplateName: GROUNDS_MAINTENANCE,
      },
      DB_REALITY_FIXTURE
    )
    assert.equal(count, 21)
  })

  it('Palma + Grounds Maintenance + Jun–Jul returns 21', () => {
    const count = countMockInspections(
      {
        preset: 'custom',
        dateFrom: '2026-06-01',
        dateTo: '2026-07-30',
        person: PALMA,
        gradeTemplateName: GROUNDS_MAINTENANCE,
      },
      DB_REALITY_FIXTURE
    )
    assert.equal(count, 21)
  })

  it('applied state includes gradeTemplateName when form filter is sent', () => {
    const raw = searchParams({
      preset: 'custom',
      dateFrom: '2026-06-01',
      dateTo: '2026-06-30',
      gradeTemplateName: GROUNDS_MAINTENANCE,
    })
    const { eff } = prepareAnalyticsEffectiveParams(raw, true)
    const appliedForm =
      (eff.get('gradeTemplateName') || 'all') !== 'all' ? eff.get('gradeTemplateName') : null
    assert.equal(appliedForm, GROUNDS_MAINTENANCE)
  })
})
