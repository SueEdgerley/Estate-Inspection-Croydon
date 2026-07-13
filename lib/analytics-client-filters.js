/**
 * Client-side Analytics filter state → query string and applied banner labels.
 * Keeps visible controls, request URL, and banner in sync.
 */

import { resolveAnalyticsPresetDates } from './analytics-date-presets.js'

const ROLE_LABELS = new Map([
  ['caretaker', 'Caretakers'],
  ['esm', 'ESMs'],
  ['housing_officer', 'Housing Officers'],
  ['housing_team_manager', 'Housing Team Managers'],
])

export const ANALYTICS_PRESET_LABELS = {
  week: 'Last 7 days',
  month: 'This month',
  quarter: 'Quarter',
  custom: 'Custom',
}

export function captureClientFilterState(state) {
  return {
    preset: state.preset ?? 'quarter',
    quarter: state.quarter ?? '',
    year: state.year ?? '',
    customFrom: state.customFrom ?? '',
    customTo: state.customTo ?? '',
    personRole: state.personRole ?? 'all',
    person: state.person ?? 'all',
    issueCategory: state.issueCategory ?? 'all',
    issueDateFrom: state.issueDateFrom ?? '',
    issueDateTo: state.issueDateTo ?? '',
    gradeBlockId: state.gradeBlockId ?? 'all',
    gradeArea: state.gradeArea ?? 'all',
    gradeTemplateName: state.gradeTemplateName ?? 'all',
  }
}

export function resolveInspectionDatesFromClientState(state) {
  const query = buildAnalyticsQueryString(state)
  return resolveAnalyticsPresetDates(new URLSearchParams(query))
}

/** Mirrors Analytics page behaviour when a custom inspection date is edited. */
export function applyCustomInspectionDate(state, field, value) {
  const s = captureClientFilterState(state)
  return {
    ...s,
    preset: 'custom',
    customFrom: field === 'customFrom' ? value : s.customFrom,
    customTo: field === 'customTo' ? value : s.customTo,
  }
}

export function buildAnalyticsQueryString(state) {
  const s = captureClientFilterState(state)
  const p = new URLSearchParams()
  p.set('preset', s.preset)
  if (s.preset === 'quarter') {
    if (s.quarter) p.set('quarter', s.quarter)
    if (s.year) p.set('year', s.year)
  }
  if (s.preset === 'custom') {
    if (s.customFrom) p.set('dateFrom', s.customFrom)
    if (s.customTo) p.set('dateTo', s.customTo)
  }
  if (s.personRole !== 'all') p.set('personRole', s.personRole)
  if (s.person !== 'all') p.set('person', s.person)
  if (s.issueCategory !== 'all') p.set('issueCategory', s.issueCategory)
  if (s.issueDateFrom) p.set('issueDateFrom', s.issueDateFrom)
  if (s.issueDateTo) p.set('issueDateTo', s.issueDateTo)
  if (s.gradeBlockId !== 'all') p.set('gradeBlockId', s.gradeBlockId)
  if (s.gradeArea !== 'all') p.set('gradeArea', s.gradeArea)
  if (s.gradeTemplateName !== 'all') p.set('gradeTemplateName', s.gradeTemplateName)
  return p.toString()
}

export function buildAppliedBannerFromClientState(state) {
  const s = captureClientFilterState(state)
  const resolved = resolveInspectionDatesFromClientState(s)
  const presetKey = resolved.preset || s.preset
  return {
    preset: ANALYTICS_PRESET_LABELS[presetKey] ?? presetKey,
    presetKey,
    dateFrom: resolved.dateFrom || null,
    dateTo: resolved.dateTo || null,
    personRole: s.personRole !== 'all' ? s.personRole : null,
    personRoleLabel: s.personRole !== 'all' ? ROLE_LABELS.get(s.personRole) ?? s.personRole : null,
    person: s.person !== 'all' ? s.person : null,
    gradeTemplateName: s.gradeTemplateName !== 'all' ? s.gradeTemplateName : null,
    gradeBlockId: s.gradeBlockId !== 'all' ? s.gradeBlockId : null,
    gradeArea: s.gradeArea !== 'all' ? s.gradeArea : null,
    issueCategory: s.issueCategory !== 'all' ? s.issueCategory : null,
    issueDateFrom: s.issueDateFrom || null,
    issueDateTo: s.issueDateTo || null,
  }
}

export function clientFiltersEqual(a, b) {
  const left = captureClientFilterState(a ?? {})
  const right = captureClientFilterState(b ?? {})
  return JSON.stringify(left) === JSON.stringify(right)
}

export function filterPeopleOptions(people, personRole) {
  const rows = Array.isArray(people) ? people : []
  if (personRole === 'all') return rows
  return rows.filter((p) => p.role === personRole)
}

export function reconcilePersonAfterRoleChange(nextRole, currentPerson, people) {
  if (currentPerson === 'all') return 'all'
  const options = filterPeopleOptions(people, nextRole)
  return options.some((p) => p.value === currentPerson) ? currentPerson : 'all'
}

/**
 * Query string must not carry stale role/person keys when set to All.
 */
export function queryHasNoRoleOrPersonParams(queryString) {
  const p = new URLSearchParams(queryString)
  const roleKeys = ['personRole', 'role', 'person', 'inspector', 'caretaker']
  return roleKeys.every((key) => {
    const v = (p.get(key) || '').trim()
    return !v || v === 'all'
  })
}

/** Action-date params are separate from inspection dateFrom/dateTo on preset queries. */
export function queryUsesSeparateActionDates(queryString) {
  const p = new URLSearchParams(queryString)
  const preset = (p.get('preset') || 'custom').trim()
  const hasActionDates = Boolean(p.get('issueDateFrom') || p.get('issueDateTo'))
  const hasCustomInspectionDates = preset === 'custom' && Boolean(p.get('dateFrom') || p.get('dateTo'))
  return { preset, hasActionDates, hasCustomInspectionDates }
}
