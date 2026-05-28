import { inspectionIsCaretaker } from '@/lib/caretaker-template'
import {
  mayViewInspectionReports,
  normalizeJobTitle,
  roleBypassesOperationalRouteRestrictions,
} from '@/lib/app-role-access'

export function inspectionIsSubmitted(inspection) {
  if (!inspection) return false
  if (inspection.submitted_at) return true
  const status = String(inspection.status || '').toLowerCase().trim()
  return status === 'submitted' || status === 'completed' || status === 'complete'
}

export function userOwnsInspection(userEmail, inspection) {
  const owner = String(inspection?.inspector_id || '').trim().toLowerCase()
  const email = String(userEmail || '').trim().toLowerCase()
  return Boolean(owner && email && owner === email)
}

export function canViewInspectionFollowUpUpdates({ roleCtx, userEmail, inspection }) {
  if (!inspection) return false
  if (roleBypassesOperationalRouteRestrictions(roleCtx)) return true
  if (mayViewInspectionReports(roleCtx?.normalized, roleCtx?.clerkIsAdmin)) return true
  const operationalRole = roleCtx?.normalized || normalizeJobTitle(roleCtx?.jobTitle)
  if (['housing_officer', 'housing_team_manager', 'esm'].includes(operationalRole)) return true
  if (userOwnsInspection(userEmail, inspection)) return true
  return false
}

export function canAddInspectionFollowUpUpdate({ roleCtx, userEmail, inspection }) {
  if (!inspection || !inspectionIsSubmitted(inspection)) return false
  if (!inspectionIsCaretaker(inspection)) return false
  if (roleBypassesOperationalRouteRestrictions(roleCtx)) return true
  if (normalizeJobTitle(roleCtx?.jobTitle) !== 'caretaker') return false
  return userOwnsInspection(userEmail, inspection)
}

export function formatInspectionFollowUpTimestamp(value) {
  const date = value ? new Date(value) : new Date()
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function mapInspectionUpdateRow(row) {
  if (!row) return null
  return {
    id: row.id,
    inspection_id: row.inspection_id,
    author_email: row.author_email,
    author_name: row.author_name || row.author_email || 'User',
    body: row.body,
    created_at: row.created_at ? new Date(row.created_at).toISOString() : null,
  }
}
