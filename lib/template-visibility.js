/**
 * Who may see which templates on /templates and GET /api/templates.
 * Delegates to lib/app-role-access.js (single source of truth).
 */
import { filterTemplatesForAppRole } from '@/lib/app-role-access'

/**
 * @param {{ appRole: string | null, clerkIsAdmin: boolean }} viewer
 * @returns {boolean}
 */
export function isTemplateAdminViewer({ appRole, clerkIsAdmin }) {
  if (clerkIsAdmin) return true
  const r = (appRole || '').toLowerCase().trim()
  return r === 'owner' || r === 'admin' || r === 'manager'
}

/**
 * @param {unknown[]} templates
 * @param {{ userId: string | null, appRole: string | null, clerkIsAdmin: boolean }} viewer
 * @returns {unknown[]}
 */
export function filterTemplatesForViewer(templates, viewer) {
  return filterTemplatesForAppRole(templates, viewer)
}
