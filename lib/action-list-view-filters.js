import { buildActionDisplay } from '@/lib/action-display-formatter'

function includesFilter(values, filter) {
  const needle = String(filter || '').trim().toLowerCase()
  if (!needle) return true
  return values.some((value) => String(value || '').toLowerCase().includes(needle))
}

/**
 * Date, location, and person filters used by the Issues / Actions page.
 * Status and search are applied by the actions API before these run.
 */
export function actionMatchesViewFilters(action, filters = {}) {
  const display = buildActionDisplay(action)

  if (filters.dateFrom || filters.dateTo) {
    const actionDate = new Date(action.inspection_submitted_at || action.inspection_created_at || action.created_at)
    if (Number.isNaN(actionDate.getTime())) return false

    if (filters.dateFrom) {
      const fromDate = new Date(filters.dateFrom)
      if (actionDate < fromDate) return false
    }

    if (filters.dateTo) {
      const toDate = new Date(filters.dateTo)
      toDate.setHours(23, 59, 59, 999)
      if (actionDate > toDate) return false
    }
  }

  if (filters.location) {
    const locationMatch = includesFilter(
      [
        display.contextLocation,
        display.location,
        display.blockLocation,
        action.estate_block_name,
        action.estate_name,
        action.block_name,
        action.location,
        action.inspection_location_label,
        action.inspection_address,
        action.inspection_location,
      ],
      filters.location
    )
    if (!locationMatch) return false
  }

  if (filters.person) {
    const personMatch = includesFilter(
      [
        display.assignedTo,
        display.completedBy,
        display.submittedBy,
        action.assigned_to,
        action.assigned_to_email,
        action.created_by,
        action.inspection_created_by_name,
        action.inspection_completed_by_name,
        action.inspection_inspector_name,
        action.completed_by,
        action.submitted_by,
      ],
      filters.person
    )
    if (!personMatch) return false
  }

  return true
}

export function filterActionsForView(actions, filters = {}) {
  return (Array.isArray(actions) ? actions : []).filter((action) => actionMatchesViewFilters(action, filters))
}
