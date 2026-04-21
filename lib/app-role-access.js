/**
 * App-wide role model (Postgres `users.role` + optional Clerk `publicMetadata.isAdmin`).
 * Used by /api/auth/me, template filtering, inspection POST, and client nav.
 */

import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '@/lib/db'
import { isNeighbourhoodVoiceTemplate } from '@/lib/airtable-client'
import { isCaretakerTemplate } from '@/lib/caretaker-template'
import { isEstateWalkaboutTemplate } from '@/lib/estate-walkabout-template'

/** Values allowed in Settings → Manage Users and PATCH /api/admin/users/:id */
export const ASSIGNABLE_APP_ROLES = [
  'admin',
  'owner',
  'caretaker',
  'housing_officer',
  'resident',
  'esm',
  'user',
]

/**
 * Normalize legacy / aliases for permission checks.
 * @param {string|null|undefined} raw
 * @returns {string}
 */
export function normalizeAppRole(raw) {
  const r = String(raw || '').toLowerCase().trim()
  if (r === 'owner') return 'admin'
  return r || 'user'
}

/**
 * @param {string} normalizedRole
 * @param {boolean} clerkIsAdmin
 */
export function isPrivilegedAdmin(normalizedRole, clerkIsAdmin) {
  if (clerkIsAdmin) return true
  return normalizedRole === 'admin'
}

/**
 * Settings / import / destructive admin (not just “see all inspections”).
 */
export function canUseSettingsAdminUi(normalizedRole, clerkIsAdmin) {
  return isPrivilegedAdmin(normalizedRole, clerkIsAdmin)
}

/**
 * May create inspections from a template (any flow: draft or submitted).
 * @param {string} normalizedRole
 * @param {boolean} clerkIsAdmin
 * @param {unknown} template — row from getTemplatesNested
 */
export function roleMayCreateInspectionWithTemplate(normalizedRole, clerkIsAdmin, template) {
  if (!template) return false
  if (isPrivilegedAdmin(normalizedRole, clerkIsAdmin)) return true
  if (normalizedRole === 'esm' || normalizedRole === 'user') return false
  if (normalizedRole === 'caretaker') return isCaretakerTemplate(template)
  if (normalizedRole === 'resident') return isNeighbourhoodVoiceTemplate(template)
  if (normalizedRole === 'housing_officer') return isEstateWalkaboutTemplate(template)
  return false
}

/**
 * Ad-hoc inspections (no template) — staff-only.
 */
export function roleMayCreateAdHocInspection(normalizedRole, clerkIsAdmin) {
  return isPrivilegedAdmin(normalizedRole, clerkIsAdmin)
}

/**
 * Filter template list for GET /api/templates and Forms UI.
 * @param {unknown[]} templates
 * @param {{ userId: string|null, appRole: string|null, clerkIsAdmin: boolean }} viewer
 */
export function filterTemplatesForAppRole(templates, viewer) {
  const list = Array.isArray(templates) ? templates : []
  if (!viewer?.userId) return list

  const raw = viewer.appRole
  const clerkIsAdmin = viewer.clerkIsAdmin === true
  const role = normalizeAppRole(raw)

  if (isPrivilegedAdmin(role, clerkIsAdmin)) return list

  if (role === 'caretaker') {
    return list.filter((t) => isCaretakerTemplate(t))
  }
  if (role === 'resident') {
    return list.filter((t) => isNeighbourhoodVoiceTemplate(t))
  }
  if (role === 'housing_officer') {
    return list.filter((t) => isEstateWalkaboutTemplate(t))
  }
  if (role === 'esm') {
    return []
  }
  if (role === 'user') {
    return []
  }

  return []
}

/**
 * Serialisable flags for /api/auth/me (client nav).
 * @param {string|null|undefined} rawRole
 * @param {boolean} clerkIsAdmin
 */
/**
 * Postgres app role for a Clerk user id (for API routes).
 * @param {string|null|undefined} clerkUserId
 * @returns {Promise<{ raw: string | null, normalized: string, clerkIsAdmin: boolean }>}
 */
export async function getAppRoleContextForClerkUser(clerkUserId, clerkIsAdminFromClerk = false) {
  if (!clerkUserId) {
    return { raw: null, normalized: 'user', clerkIsAdmin: !!clerkIsAdminFromClerk }
  }
  let raw = null
  try {
    if (getPgUrl()) {
      await ensureDatabase()
      const r = await sql`SELECT role FROM users WHERE clerk_user_id = ${clerkUserId} LIMIT 1`
      raw = r.rows[0]?.role ?? null
    }
  } catch {
    /* ignore */
  }
  return {
    raw,
    normalized: normalizeAppRole(raw),
    clerkIsAdmin: !!clerkIsAdminFromClerk,
  }
}

export function getRoleUiFlags(rawRole, clerkIsAdmin) {
  const normalizedRole = normalizeAppRole(rawRole)
  const admin = isPrivilegedAdmin(normalizedRole, clerkIsAdmin)

  return {
    normalizedRole,
    clerkIsAdmin: !!clerkIsAdmin,
    /** Full staff: templates, ad-hoc, settings, imports, analytics */
    isFullAdmin: admin,
    nav: {
      home: true,
      inspections: true,
      /** List + detail; ESM and most roles need this */
      inspectionsAdHoc: admin,
      actions: normalizedRole !== 'resident',
      templates: admin || ['caretaker', 'resident', 'housing_officer'].includes(normalizedRole),
      import: admin,
      guides: true,
      settings: admin,
      downloads: admin,
      analytics: admin,
    },
  }
}
