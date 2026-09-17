/**
 * Canonical selected-period management figures.
 *
 * Analytics UI and any future Director/HOS Monthly Report PDF MUST consume this
 * object. Do not recompute these measures in a PDF generator or a second query path.
 *
 * A future Monthly Report button should only choose a period (This month /
 * Previous month) via resolveAnalyticsPresetDates, then loadAnalyticsPayload
 * and pass body.management / body.directorHosReport into the PDF.
 */

import { summariseAbcd } from './analytics-grade-summary.js'

export const DIRECTOR_HOS_REPORT_SOURCE = 'analytics.management'

export const MONTHLY_REPORT_PERIOD_OPTIONS = [
  { value: 'month', label: 'This month' },
  { value: 'previous_month', label: 'Previous month' },
]

export function buildManagementPeriod({ preset = '', dateFrom = '', dateTo = '', label = '' } = {}) {
  return {
    preset: String(preset || '').trim() || 'custom',
    dateFrom: String(dateFrom || '').trim() || null,
    dateTo: String(dateTo || '').trim() || null,
    label: String(label || '').trim() || null,
  }
}

/**
 * Single management snapshot for the selected Analytics period.
 * `directorHosReport` in the payload is this same object.
 */
export function buildManagementReport({
  period,
  inspectionsCompleted = 0,
  blocksInspected = 0,
  grades,
  topIssues = [],
  attentionBlocks = [],
  inspectionsByForm = [],
} = {}) {
  const resolvedGrades = grades?.abcd != null ? grades : summariseAbcd(grades || {})
  const resolvedPeriod = buildManagementPeriod(period)
  return {
    source: DIRECTOR_HOS_REPORT_SOURCE,
    period: resolvedPeriod,
    inspectionsCompleted: Number(inspectionsCompleted) || 0,
    blocksInspected: Number(blocksInspected) || 0,
    estatesInspected: null,
    estatesInspectedUnavailableReason:
      'Estate linkage on blocks/inspections is incomplete. Do not display Estates inspected as a reliable figure.',
    grades: resolvedGrades,
    headlines: {
      abPct: resolvedGrades.abPct,
      cdPct: resolvedGrades.cdPct,
      abLabel: resolvedGrades.abcd
        ? `${resolvedGrades.ab}/${resolvedGrades.abcd} = ${resolvedGrades.abPct}% A+B`
        : '—',
      cdLabel: resolvedGrades.abcd
        ? `${resolvedGrades.cd}/${resolvedGrades.abcd} = ${resolvedGrades.cdPct}% C/D`
        : '—',
    },
    topIssues: (topIssues || []).map((row) => ({
      theme: row.theme || row.category,
      count: Number(row.cnt ?? row.count ?? 0) || 0,
    })),
    attentionBlocks: (attentionBlocks || []).map((row) => ({
      blockId: row.blockId || row.block_id || '',
      blockName: row.blockName || row.block_name || 'Unknown block',
      estateName: row.estateName || row.estate_name || '',
      c: Number(row.c) || 0,
      d: Number(row.d) || 0,
      cd: Number(row.cd) || 0,
      gradedAbcd: Number(row.gradedAbcd ?? row.graded_abcd) || 0,
      cdPct: row.cdPct,
      display: row.display,
    })),
    inspectionsByForm: (inspectionsByForm || []).map((row) => ({
      form: row.form,
      inspections: Number(row.inspections ?? row.cnt ?? 0) || 0,
    })),
  }
}
