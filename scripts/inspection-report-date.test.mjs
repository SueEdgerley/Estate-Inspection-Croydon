/**
 * Inspection report banner date vs later submission/recovery timestamp.
 * Run: node --test scripts/inspection-report-date.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  formatInspectionReportDate,
  formatInspectionReportDateTime,
  resolveInspectionReportDates,
} from '../lib/inspection-report-date.js'

describe('formatInspectionReportDate', () => {
  it('prints a YYYY-MM-DD inspection date without shifting the calendar day', () => {
    assert.equal(formatInspectionReportDate('2026-10-06'), '6 October 2026')
  })
})

describe('resolveInspectionReportDates for a recovered Walkabout', () => {
  it('uses the original inspection date, not the later submitted_at', () => {
    const resolved = resolveInspectionReportDates({
      isWalkabout: true,
      answers: {
        ew_sig_inspection_date: '2026-10-06',
        ew_q_planned_date: '2026-10-06',
      },
      inspectionRow: {
        inspection_start_time: '2026-10-06T12:18:00.000Z',
        submitted_at: '2026-10-08T16:45:00.000Z',
      },
    })
    assert.equal(formatInspectionReportDate(resolved.inspectionDate), '6 October 2026')
    assert.match(formatInspectionReportDateTime(resolved.submittedAt), /8 October 2026/)
    assert.notEqual(
      formatInspectionReportDate(resolved.inspectionDate),
      formatInspectionReportDate(resolved.submittedAt)
    )
  })

  it('falls back to planned date, then start time, and never to submit day for Walkabout', () => {
    const fromPlanned = resolveInspectionReportDates({
      isWalkabout: true,
      answers: { ew_q_planned_date: '2026-10-06' },
      inspectionRow: { submitted_at: '2026-10-08T16:45:00.000Z' },
    })
    assert.equal(fromPlanned.inspectionDate, '2026-10-06')
    assert.equal(fromPlanned.submittedAt, '2026-10-08T16:45:00.000Z')

    const fromStart = resolveInspectionReportDates({
      isWalkabout: true,
      answers: {},
      inspectionRow: {
        inspection_start_time: '2026-10-06T12:18:00.000Z',
        submitted_at: '2026-10-08T16:45:00.000Z',
      },
    })
    assert.equal(fromStart.inspectionDate, '2026-10-06T12:18:00.000Z')

    const unknown = resolveInspectionReportDates({
      isWalkabout: true,
      answers: {},
      inspectionRow: { submitted_at: '2026-10-08T16:45:00.000Z' },
    })
    assert.equal(unknown.inspectionDate, '')
    assert.equal(unknown.submittedAt, '2026-10-08T16:45:00.000Z')
  })
})

describe('resolveInspectionReportDates for other inspection forms', () => {
  it('Caretaker, ESM and Grounds still use submitted_at when no inspection or start date exists', () => {
    const resolved = resolveInspectionReportDates({
      isWalkabout: false,
      answers: {},
      inspectionRow: { submitted_at: '2026-09-12T09:00:00.000Z' },
    })
    assert.equal(resolved.inspectionDate, '2026-09-12T09:00:00.000Z')
    assert.equal(formatInspectionReportDate(resolved.inspectionDate), '12 September 2026')
  })

  it('other forms still prefer the recorded start time over submitted_at', () => {
    const resolved = resolveInspectionReportDates({
      isWalkabout: false,
      answers: {},
      inspectionRow: {
        inspection_start_time: '2026-09-12T08:10:00.000Z',
        submitted_at: '2026-09-12T09:00:00.000Z',
      },
    })
    assert.equal(resolved.inspectionDate, '2026-09-12T08:10:00.000Z')
    assert.equal(resolved.submittedAt, '2026-09-12T09:00:00.000Z')
  })

  it('Walkabout-only date fields do not steal the banner date on a Caretaker report', () => {
    const resolved = resolveInspectionReportDates({
      isWalkabout: false,
      answers: { ct_q_lobby: 'Yes' },
      inspectionRow: {
        inspection_start_time: '2026-09-12T08:10:00.000Z',
        submitted_at: '2026-09-12T09:00:00.000Z',
      },
    })
    assert.equal(resolved.inspectionDate, '2026-09-12T08:10:00.000Z')
  })
})
