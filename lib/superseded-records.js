/**
 * Archive/supersede helpers. Records stay addressable by original ID.
 * Dashboards and outstanding totals should exclude them; GET-by-id does not.
 */

export const SUPERSEDED_STATUS_VALUES = ['superseded', 'archived']

export function sqlInspectionNotSuperseded(alias = '') {
  const col = alias ? `${alias}.superseded_by` : 'superseded_by'
  const statusCol = alias ? `${alias}.status` : 'status'
  return `(${col} IS NULL AND lower(trim(COALESCE(${statusCol}, ''))) NOT IN ('superseded', 'archived'))`
}

export function sqlActionNotSuperseded(alias = 'a') {
  const col = `${alias}.superseded_by`
  const statusCol = `${alias}.status`
  return `(${col} IS NULL AND lower(trim(COALESCE(${statusCol}, ''))) NOT IN ('superseded', 'archived', 'duplicate'))`
}

/** Outstanding lists: hide archived actions and actions whose parent inspection was archived. */
export function sqlOutstandingActionNotSuperseded(actionAlias = 'a', inspectionAlias = 'i') {
  return `(${sqlActionNotSuperseded(actionAlias)} AND ${sqlInspectionNotSuperseded(inspectionAlias)})`
}

export function sqlOutstandingActionNotSupersededUnjoined(actionAlias = 'a') {
  return `(${sqlActionNotSuperseded(actionAlias)} AND NOT EXISTS (
    SELECT 1 FROM inspections _sup_i
    WHERE _sup_i.id = ${actionAlias}.inspection_id
      AND NOT (${sqlInspectionNotSuperseded('_sup_i')})
  ))`
}

export function inspectionVisibleInReports(row) {
  if (!row) return false
  if (row.superseded_by) return false
  const status = String(row.status || '')
    .trim()
    .toLowerCase()
  return !SUPERSEDED_STATUS_VALUES.includes(status)
}

export function actionVisibleInOutstanding(row, parentInspection = null) {
  if (!row) return false
  if (row.superseded_by) return false
  const status = String(row.status || '')
    .trim()
    .toLowerCase()
  if (['superseded', 'archived', 'duplicate'].includes(status)) return false
  if (parentInspection && !inspectionVisibleInReports(parentInspection)) return false
  return true
}
