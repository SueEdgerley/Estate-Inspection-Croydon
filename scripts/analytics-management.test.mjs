/**
 * Analytics management reporting: A–D aggregation, issue themes, attention blocks,
 * inspections by form, selected-period snapshot for a future Director/HOS PDF.
 * Run: npm run test:analytics-management
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { summariseAbcd, parseGradeToken, rankAttentionBlocks, ATTENTION_BLOCK_MIN_GRADED, formatCdShare, GRADE_SCORE, scoreToGrade, mapBlockAverageRow, sortBlockAverageRows } from '../lib/analytics-grade-summary.js'
import { mapIssueTheme, aggregateIssueThemes, isTechnicalOrFormIssueLabel, ISSUE_THEMES } from '../lib/analytics-issue-themes.js'
import { analyticsFormLabel, aggregateInspectionsByForm } from '../lib/analytics-form-labels.js'
import { buildManagementReport, DIRECTOR_HOS_REPORT_SOURCE, MONTHLY_REPORT_PERIOD_OPTIONS } from '../lib/analytics-management-report.js'
import { FALSE_ACTION_VOID_MARKER, isExcludedFromAnalytics, sqlExcludeFalseAutoActions } from '../lib/false-action-cleanup.js'
import { resolveAnalyticsPresetDates } from '../lib/analytics-date-presets.js'

const THIS_MONTH_BASELINE = { a: 435, b: 331, c: 94, d: 15, na: 284 }

describe('A-D aggregation and percentages', () => {
  it('matches the This month investigation baseline and excludes NA from the denominator', () => {
    const grades = summariseAbcd(THIS_MONTH_BASELINE)
    assert.equal(grades.abcd, 875)
    assert.equal(grades.ab, 766)
    assert.equal(grades.cd, 109)
    assert.equal(grades.na, 284)
    assert.equal(grades.aPct, 49.7)
    assert.equal(grades.bPct, 37.8)
    assert.equal(grades.cPct, 10.7)
    assert.equal(grades.dPct, 1.7)
    assert.equal(grades.abPct, 87.5)
    assert.equal(grades.cdPct, 12.5)
  })

  it('does not count NA in A-D percentages', () => {
    const grades = summariseAbcd({ a: 1, b: 1, c: 1, d: 1, na: 96 })
    assert.equal(grades.abcd, 4)
    assert.equal(grades.aPct, 25)
    assert.equal(grades.abPct, 50)
    assert.equal(grades.cdPct, 50)
  })

  it('returns null percentages when there are no A-D grades', () => {
    const grades = summariseAbcd({ na: 10 })
    assert.equal(grades.abcd, 0)
    assert.equal(grades.abPct, null)
    assert.equal(grades.cdPct, null)
  })

  it('parses grade tokens including Grade C and NA variants', () => {
    assert.equal(parseGradeToken('A'), 'A')
    assert.equal(parseGradeToken('grade D'), 'D')
    assert.equal(parseGradeToken('N/A'), 'NA')
    assert.equal(parseGradeToken('Yes'), null)
  })
})

describe('issue-theme mapping', () => {
  it('maps Caretaker section categories to management themes', () => {
    assert.equal(mapIssueTheme({ category: 'repairs', title: '7. Any repairs to report?' }), ISSUE_THEMES.REPAIRS)
    assert.equal(mapIssueTheme({ category: 'asb' }), ISSUE_THEMES.ASB)
    assert.equal(mapIssueTheme({ category: 'internal_cleaning' }), ISSUE_THEMES.CLEANING)
    assert.equal(mapIssueTheme({ category: 'health_and_safety' }), ISSUE_THEMES.HEALTH_AND_SAFETY)
    assert.equal(mapIssueTheme({ category: 'fire_safety' }), ISSUE_THEMES.FIRE_SAFETY)
    assert.equal(mapIssueTheme({ category: 'pest_control' }), ISSUE_THEMES.PEST_CONTROL)
    assert.equal(
      mapIssueTheme({ category: 'external_cleaning', title: '2. External Cleaning - Fly Tipping' }),
      ISSUE_THEMES.FLY_TIPPING
    )
  })

  it('maps ESM C/D findings from section/question, not esm_photo_comment_issue', () => {
    assert.equal(
      mapIssueTheme({
        category: 'esm_photo_comment_issue',
        sectionName: '14. Grounds Maintenance',
        title: 'Please confirm the overall rating for weed clearance',
        templateName: 'ESM Inspection Form',
      }),
      ISSUE_THEMES.GROUNDS
    )
    assert.equal(
      mapIssueTheme({
        category: 'esm_photo_comment_issue',
        sectionName: '10. Waste Management',
        title: 'Please confirm the overall rating for fly tipping',
        templateName: 'ESM Inspection Form',
      }),
      ISSUE_THEMES.FLY_TIPPING
    )
    assert.equal(
      mapIssueTheme({
        category: 'esm_photo_comment_issue',
        sectionName: '1. Internal Cleaning',
        title: 'Please confirm the overall rating for cobwebs',
        templateName: 'ESM Inspection Form',
      }),
      ISSUE_THEMES.CLEANING
    )
    assert.equal(mapIssueTheme({ category: 'esm_hedge_maintenance_rating' }), ISSUE_THEMES.GROUNDS)
    assert.equal(mapIssueTheme({ category: 'esm_noticeboards_rating' }), ISSUE_THEMES.CLEANING)
  })

  it('maps Walkabout standard questions and additional findings, not estate_walkabout', () => {
    assert.equal(
      mapIssueTheme({
        category: 'estate_walkabout',
        questionId: 'ew_it_communal_areas_clear',
        title: '4. Item inspections - Are the communal areas clear / free from obstruction?',
      }),
      ISSUE_THEMES.FLY_TIPPING
    )
    assert.equal(
      mapIssueTheme({
        category: 'estate_walkabout',
        questionId: 'ew_it_communal_lighting',
      }),
      ISSUE_THEMES.LIGHTING
    )
    assert.equal(
      mapIssueTheme({
        category: 'estate_walkabout',
        questionId: 'ew_chk_d9d1d0b2',
        title: 'Walkabout — Cooker on communal landing outside Flat 7',
      }),
      ISSUE_THEMES.FLY_TIPPING
    )
    assert.equal(
      mapIssueTheme({
        category: 'estate_walkabout',
        questionId: 'ew_chk_5a6a3dbb',
        title: 'Walkabout — No intercom',
      }),
      ISSUE_THEMES.REPAIRS
    )
  })

  it('normalises Grounds Maintenance form findings onto Grounds Maintenance', () => {
    assert.equal(
      mapIssueTheme({
        category: 'grounds',
        sectionName: 'Section 4: Grounds Maintenance – Weed Clearance',
        title: 'Are there any issues to report for this area?',
        templateName: 'Grounds Maintenance',
      }),
      ISSUE_THEMES.GROUNDS
    )
  })

  it('maps Neighbourhood Voice and Repairs Inspector categories', () => {
    assert.equal(
      mapIssueTheme({ category: 'lighting', templateName: 'Neighbourhood Voice' }),
      ISSUE_THEMES.LIGHTING
    )
    assert.equal(
      mapIssueTheme({ category: 'grounds_maintenance', templateName: 'Neighbourhood Voice' }),
      ISSUE_THEMES.GROUNDS
    )
    assert.equal(
      mapIssueTheme({ category: 'repair_issue', templateName: 'Repairs Inspector Form', inspectionType: 'repairs_inspector' }),
      ISSUE_THEMES.REPAIRS
    )
  })

  it('does not leak technical or form labels into Top Issues', () => {
    const leaked = [
      'estate_walkabout',
      'esm_photo_comment_issue',
      'grounds',
      'esm_hedge_maintenance_rating',
      'esm_noticeboards_rating',
      'esm_storage_areas_rating',
      'esm_drying_areas',
      'esm_lifts_comment',
    ]
    for (const category of leaked) {
      assert.equal(isTechnicalOrFormIssueLabel(category), true, category)
      const theme = mapIssueTheme({
        category,
        sectionName: '14. Grounds Maintenance',
        title: 'weed clearance',
        questionId: category === 'estate_walkabout' ? 'ew_it_grounds' : '',
        templateName: category === 'grounds' ? 'Grounds Maintenance' : 'ESM Inspection Form',
      })
      assert.equal(isTechnicalOrFormIssueLabel(theme), false, `${category} -> ${theme}`)
    }

    const aggregated = aggregateIssueThemes([
      { category: 'estate_walkabout', questionId: 'ew_it_door_entry', cnt: 2 },
      { category: 'esm_photo_comment_issue', sectionName: '1. Internal Cleaning', title: 'cobwebs', templateName: 'ESM Inspection Form', cnt: 4 },
      { category: 'grounds', templateName: 'Grounds Maintenance', title: 'weed clearance', cnt: 3 },
      { category: 'repairs', cnt: 5 },
    ])
    const names = aggregated.map((row) => row.theme)
    for (const label of leaked) {
      assert.equal(names.includes(label), false)
    }
    assert.equal(aggregated.find((row) => row.theme === ISSUE_THEMES.REPAIRS)?.cnt, 7)
    assert.equal(aggregated.find((row) => row.theme === ISSUE_THEMES.CLEANING)?.cnt, 4)
    assert.equal(aggregated.find((row) => row.theme === ISSUE_THEMES.GROUNDS)?.cnt, 3)
  })
})

describe('[FALSE_AUTO_ACTION] exclusion', () => {
  it('marks voided notes as excluded and keeps them out of theme totals', () => {
    assert.equal(isExcludedFromAnalytics(`[FALSE_AUTO_ACTION] closed`), true)
    const aggregated = aggregateIssueThemes([
      { category: 'repairs', cnt: 2, repairNotes: '' },
      { category: 'repairs', cnt: 9, repairNotes: `${FALSE_ACTION_VOID_MARKER} Auto-created in error` },
    ])
    assert.equal(aggregated.find((row) => row.theme === ISSUE_THEMES.REPAIRS)?.cnt, 2)
  })

  it('keeps the Analytics action SQL filter on the void marker', () => {
    assert.match(sqlExcludeFalseAutoActions('a'), /\[FALSE_AUTO_ACTION\]/)
  })
})

describe('blocks requiring attention', () => {
  it('ranks by C/D percentage only when there are at least 10 graded checks', () => {
    const ranked = rankAttentionBlocks(
      [
        { block_name: 'Tiny sample', cd: 1, graded_abcd: 1, c: 0, d: 1 },
        { block_name: 'South Norwood Hill 198-204A', cd: 7, graded_abcd: 18, c: 1, d: 6 },
        { block_name: 'South Norwood Hill 190-196A', cd: 7, graded_abcd: 19, c: 3, d: 4 },
        { block_name: 'South Norwood Hill 182-188A', cd: 5, graded_abcd: 16, c: 1, d: 4 },
        { block_name: 'Thorpe Close 1-7', cd: 8, graded_abcd: 28, c: 8, d: 0 },
      ],
      { minGraded: ATTENTION_BLOCK_MIN_GRADED, limit: 3 }
    )
    assert.equal(ranked.length, 3)
    assert.equal(ranked[0].blockName, 'South Norwood Hill 198-204A')
    assert.equal(ranked[0].cd, 7)
    assert.equal(ranked[0].gradedAbcd, 18)
    assert.equal(ranked[0].cdPct, 38.9)
    assert.equal(ranked[0].display, '7 / 18 — 38.9% C/D')
    assert.equal(ranked[1].blockName, 'South Norwood Hill 190-196A')
    assert.equal(ranked[2].blockName, 'South Norwood Hill 182-188A')
    assert.equal(ranked.some((row) => row.blockName === 'Tiny sample'), false)
    assert.equal(formatCdShare(7, 18), '7 / 18 — 38.9% C/D')
  })
})

describe('inspections by form and blocks inspected', () => {
  it('labels the actual forms and keeps unknown extras separate', () => {
    assert.equal(analyticsFormLabel({ templateName: 'ESM Inspection Form' }), 'ESM')
    assert.equal(analyticsFormLabel({ templateName: 'Caretaker Inspection' }), 'Caretaker')
    assert.equal(analyticsFormLabel({ type: 'estate_walkabout' }), 'Estate Walkabout')
    assert.equal(analyticsFormLabel({ templateName: 'Grounds Maintenance' }), 'Grounds Maintenance')
    assert.equal(analyticsFormLabel({ templateName: 'Neighbourhood Voice' }), 'Neighbourhood Voice')
    assert.equal(analyticsFormLabel({ type: 'repairs_inspector' }), 'Repairs Inspector')

    const byForm = aggregateInspectionsByForm([
      { form: 'Caretaker', inspections: 653 },
      { form: 'ESM', inspections: 36 },
      { form: 'Grounds Maintenance', inspections: 31 },
      { form: 'Estate Walkabout', inspections: 11 },
    ])
    assert.equal(byForm.find((row) => row.form === 'Caretaker').inspections, 653)
    assert.equal(byForm.find((row) => row.form === 'Neighbourhood Voice').inspections, 0)
    assert.equal(byForm.find((row) => row.form === 'Repairs Inspector').inspections, 0)
    assert.equal(
      byForm.filter((row) => ['Caretaker', 'ESM', 'Estate Walkabout', 'Grounds Maintenance'].includes(row.form))
        .reduce((sum, row) => sum + row.inspections, 0),
      731
    )
  })
})

describe('selected-period management snapshot', () => {
  it('puts every management measure on one period object for UI and future PDF', () => {
    const period = { preset: 'month', dateFrom: '2026-09-01', dateTo: '2026-09-17', label: 'This month' }
    const report = buildManagementReport({
      period,
      inspectionsCompleted: 731,
      blocksInspected: 265,
      grades: summariseAbcd(THIS_MONTH_BASELINE),
      topIssues: [{ theme: ISSUE_THEMES.REPAIRS, cnt: 25 }],
      attentionBlocks: rankAttentionBlocks([
        { block_name: 'South Norwood Hill 198-204A', cd: 7, graded_abcd: 18, c: 1, d: 6 },
      ]),
      inspectionsByForm: [{ form: 'Caretaker', inspections: 653 }],
    })
    assert.equal(report.source, DIRECTOR_HOS_REPORT_SOURCE)
    assert.deepEqual(report.period, {
      preset: 'month',
      dateFrom: '2026-09-01',
      dateTo: '2026-09-17',
      label: 'This month',
    })
    assert.equal(report.inspectionsCompleted, 731)
    assert.equal(report.blocksInspected, 265)
    assert.equal(report.estatesInspected, null)
    assert.equal(report.grades.abPct, 87.5)
    assert.equal(report.grades.cdPct, 12.5)
    assert.equal(report.topIssues[0].theme, ISSUE_THEMES.REPAIRS)
    assert.equal(report.inspectionsByForm[0].form, 'Caretaker')
    assert.equal(report.attentionBlocks[0].display, '7 / 18 — 38.9% C/D')
    assert.equal(report.blockAverages.length, 0)
  })

  it('resolves This month and Previous month through the shared Analytics date helper', () => {
    const thisMonth = resolveAnalyticsPresetDates(new URLSearchParams({ preset: 'month' }))
    const previous = resolveAnalyticsPresetDates(new URLSearchParams({ preset: 'previous_month' }))
    assert.equal(thisMonth.preset, 'month')
    assert.equal(previous.preset, 'previous_month')
    assert.ok(previous.dateTo < thisMonth.dateFrom)
    assert.deepEqual(
      MONTHLY_REPORT_PERIOD_OPTIONS.map((row) => row.value),
      ['month', 'previous_month']
    )
  })
})

describe('average grade by block', () => {
  it('reuses the existing Analytics scale A=4 best through D=1, not A=1', () => {
    assert.deepEqual(GRADE_SCORE, { A: 4, B: 3, C: 2, D: 1 })
  })

  it('uses cautious midpoint banding so exact midpoints fall to the lower grade', () => {
    assert.equal(scoreToGrade(4), 'A')
    assert.equal(scoreToGrade(3.51), 'A')
    assert.equal(scoreToGrade(3.5), 'B')
    assert.equal(scoreToGrade(2.51), 'B')
    assert.equal(scoreToGrade(2.5), 'C')
    assert.equal(scoreToGrade(1.51), 'C')
    assert.equal(scoreToGrade(1.5), 'D')
    assert.equal(scoreToGrade(1), 'D')
  })

  it('groups by recorded block_id and keeps the stored block name', () => {
    const left = mapBlockAverageRow({
      block_id: 'blk_000007',
      block_name: 'Alford Green 1-27',
      graded_inspections: 6,
      avg_score: 3.2,
      latest_score: 3,
      latest_submitted_at: '2026-09-17T09:00:00.000Z',
    })
    const right = mapBlockAverageRow({
      block_id: 'blk_other_1_12',
      block_name: '1–12',
      graded_inspections: 2,
      avg_score: 1.8,
      latest_score: 2,
      latest_submitted_at: '2026-09-10T09:00:00.000Z',
    })
    assert.equal(left.blockName, 'Alford Green 1-27')
    assert.equal(right.blockName, '1–12')
    assert.notEqual(left.blockId, right.blockId)
    assert.equal(left.avgGrade, 'B')
    assert.equal(right.avgGrade, 'C')
    assert.equal(left.latestGrade, 'B')
    assert.equal(left.gradedInspections, 6)
  })

  it('sorts worst average first while keeping inspection count as a tie-break', () => {
    const sorted = sortBlockAverageRows(
      [
        mapBlockAverageRow({
          block_name: 'Alford Green 1-27',
          block_id: 'a',
          graded_inspections: 6,
          avg_score: 3.1,
        }),
        mapBlockAverageRow({
          block_name: 'Alford Green 29-43',
          block_id: 'b',
          graded_inspections: 5,
          avg_score: 2.2,
        }),
        mapBlockAverageRow({
          block_name: 'Alford Green 46-60',
          block_id: 'c',
          graded_inspections: 1,
          avg_score: 2.2,
        }),
      ],
      'avgScore',
      'asc'
    )
    assert.equal(sorted[0].blockName, 'Alford Green 29-43')
    assert.equal(sorted[1].blockName, 'Alford Green 46-60')
    assert.equal(sorted[2].blockName, 'Alford Green 1-27')
  })

  it('adds block averages without changing cumulative A–D totals', () => {
    const grades = summariseAbcd(THIS_MONTH_BASELINE)
    const report = buildManagementReport({
      period: { preset: 'month', dateFrom: '2026-09-01', dateTo: '2026-09-17', label: 'This month' },
      inspectionsCompleted: 731,
      blocksInspected: 265,
      grades,
      blockAverages: [
        {
          block_name: 'Alford Green 1-27',
          block_id: 'blk_000007',
          graded_inspections: 6,
          avg_score: 3.2,
          latest_score: 3,
          latest_submitted_at: '2026-09-17',
        },
      ],
    })
    assert.equal(report.grades.abPct, 87.5)
    assert.equal(report.grades.cdPct, 12.5)
    assert.equal(report.blockAverages[0].blockName, 'Alford Green 1-27')
    assert.equal(report.blockAverages[0].avgGrade, 'B')
    assert.equal(report.blockAverages[0].gradedInspections, 6)
  })
})
