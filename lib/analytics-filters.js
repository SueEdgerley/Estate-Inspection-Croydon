/**
 * Pure Analytics filter pipeline — maps UI query params to shared inspection WHERE args.
 * No database imports so this module can be unit-tested with node:test.
 */

import { buildInspectionWhereConditions, joinSqlAnd } from './inspection-filters.js'
import { resolveAnalyticsPresetDates } from './analytics-date-presets.js'

const TEMPORARILY_DISABLE_ESTATE_SCOPING = true

function normalizeAnalyticsRole(value) {
  const v = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
  if (v === 'caretaker' || v === 'caretakers') return 'caretaker'
  if (v === 'esm' || v === 'estate_services_manager' || v === 'estate_services_managers') return 'esm'
  if (v === 'housing_officer' || v === 'housing_officers') return 'housing_officer'
  if (v === 'housing_team_manager' || v === 'housing_team_managers') return 'housing_team_manager'
  if (!v || v === 'all') return 'all'
  return 'all'
}

export { normalizeAnalyticsRole }

/**
 * Resolve analytics UI query params to the effective inspection filter args used by
 * every completed-inspection aggregate (overview, trends, estates/blocks, performance).
 *
 * Maps the Analytics filter bar fields (gradeTemplateName, gradeBlockId, gradeArea) into
 * the shared inspection WHERE builder so Person, Form, Date, Block and Area combine
 * with AND logic.
 *
 * @param {URLSearchParams} searchParams
 * @param {boolean} admin
 * @param {{ email?: string | null }} [internalUser]
 */
export function buildAnalyticsFilterArgs(searchParams, admin, internalUser) {
  const templateNameRaw =
    (searchParams.get('gradeTemplateName') || searchParams.get('templateName') || '').trim()
  const blockIdRaw =
    (searchParams.get('gradeBlockId') || searchParams.get('blockId') || '').trim()
  const estateAreaRaw =
    (searchParams.get('gradeArea') || searchParams.get('estateArea') || '').trim()
  const roleRaw = (searchParams.get('role') || searchParams.get('personRole') || 'all').trim()
  const normalizedRole = normalizeAnalyticsRole(roleRaw)
  const inspectorRaw = (searchParams.get('inspector') || searchParams.get('person') || 'all').trim()

  return {
    completionScope: 'completed',
    dateField: 'submitted_at',
    dateFrom: searchParams.get('dateFrom') || '',
    dateTo: searchParams.get('dateTo') || '',
    type: searchParams.get('type') || 'all',
    template: searchParams.get('template') || 'all',
    templateName: templateNameRaw && templateNameRaw !== 'all' ? templateNameRaw : '',
    workType: searchParams.get('workType') || 'all',
    role: normalizedRole !== 'all' ? normalizedRole : 'all',
    estateId: searchParams.get('estateId') || '',
    blockId: blockIdRaw && blockIdRaw !== 'all' ? blockIdRaw : '',
    estateArea: estateAreaRaw && estateAreaRaw !== 'all' ? estateAreaRaw : '',
    inspector: inspectorRaw && inspectorRaw !== 'all' ? inspectorRaw : 'all',
    scheduled: searchParams.get('scheduled') || 'all',
    grading: searchParams.get('grading') || 'all',
    admin,
    fallbackInspectorId: !TEMPORARILY_DISABLE_ESTATE_SCOPING ? internalUser?.email : null,
  }
}

/**
 * Normalise Analytics URL params (preset dates, person/role → inspector) before building filters.
 *
 * @param {URLSearchParams} searchParams
 * @param {boolean} admin
 */
export function prepareAnalyticsEffectiveParams(searchParams, admin = false) {
  const eff = new URLSearchParams(searchParams.toString())
  const presetDates = resolveAnalyticsPresetDates(eff)
  if (presetDates.preset !== 'custom') {
    if (presetDates.dateFrom) eff.set('dateFrom', presetDates.dateFrom)
    if (presetDates.dateTo) eff.set('dateTo', presetDates.dateTo)
  }

  const legacyCaretaker = (eff.get('caretaker') || 'all').trim()
  const selectedRole = normalizeAnalyticsRole(
    eff.get('personRole') || eff.get('role') || (legacyCaretaker !== 'all' ? 'caretaker' : 'all')
  )
  const selectedPerson = (eff.get('person') || legacyCaretaker || 'all').trim()

  eff.delete('caretaker')
  if (selectedRole !== 'all') {
    eff.set('role', selectedRole)
    eff.set('personRole', selectedRole)
  } else {
    eff.delete('role')
    eff.delete('personRole')
  }
  if (selectedPerson !== 'all') {
    eff.set('inspector', selectedPerson)
    eff.set('person', selectedPerson)
  } else {
    eff.delete('inspector')
    eff.delete('person')
  }

  const filterAsAdmin = admin || selectedPerson !== 'all'

  return { eff, filterAsAdmin, selectedRole, selectedPerson, presetDates }
}

/**
 * Build the completed-inspection WHERE clause used by overview cards, trends, and tables.
 * @param {URLSearchParams} searchParams
 * @param {boolean} admin
 * @param {{ email?: string | null }} [internalUser]
 * @returns {[string, unknown[]]}
 */
export function buildAnalyticsCompletedWhere(searchParams, admin, internalUser) {
  const { eff, filterAsAdmin } = prepareAnalyticsEffectiveParams(searchParams, admin)
  const filterCompleted = buildAnalyticsFilterArgs(eff, filterAsAdmin, internalUser)
  return joinSqlAnd(buildInspectionWhereConditions(filterCompleted))
}
