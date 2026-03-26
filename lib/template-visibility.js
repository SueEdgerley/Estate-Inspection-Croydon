/**
 * Who may see which templates on /templates and GET /api/templates.
 * Uses Postgres users.role + Clerk publicMetadata.isAdmin; Airtable content unchanged.
 */
import { isNeighbourhoodVoiceTemplate } from '@/lib/airtable-client'

/**
 * @param {{ appRole: string | null, clerkIsAdmin: boolean }} viewer
 * @returns {boolean}
 */
export function isTemplateAdminViewer({ appRole, clerkIsAdmin }) {
  if (clerkIsAdmin) return true
  const r = (appRole || '').toLowerCase().trim()
  return r === 'owner' || r === 'admin'
}

/**
 * @param {unknown[]} templates
 * @param {{ appRole: string | null, clerkIsAdmin: boolean }} viewer
 * @returns {unknown[]}
 */
export function filterTemplatesForViewer(templates, viewer) {
  const list = Array.isArray(templates) ? templates : []
  if (isTemplateAdminViewer(viewer)) return list

  const r = (viewer.appRole || '').toLowerCase().trim()
  if (r === 'resident') {
    return list.filter((t) => isNeighbourhoodVoiceTemplate(t))
  }

  // Officers / staff / default user: inspection templates; NV is resident-facing only on this screen
  return list.filter((t) => !isNeighbourhoodVoiceTemplate(t))
}
