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

const NAV_ALL = {
  home: true,
  inspections: true,
  inspectionsAdHoc: true,
  actions: true,
  templates: true,
  import: true,
  guides: true,
  settings: true,
  downloads: true,
  analytics: true,
  inspectionReports: true,
}

/**
 * Manager / HOS / ESM-style access to Neon-backed inspection aggregates (not residents).
 */
export function mayViewInspectionReports(normalizedRole, clerkIsAdmin) {
  if (isPrivilegedAdmin(normalizedRole, clerkIsAdmin)) return true
  return ['housing_officer', 'esm', 'caretaker'].includes(normalizedRole)
}

/** Analytics dashboard (Neon aggregates) — same cohort as inspection reports. */
export function mayViewManagerAnalytics(normalizedRole, clerkIsAdmin) {
  return mayViewInspectionReports(normalizedRole, clerkIsAdmin)
}

export function getRoleUiFlags(rawRole, clerkIsAdmin) {
  const normalizedRole = normalizeAppRole(rawRole)
  if (clerkIsAdmin || normalizedRole === 'admin') {
    return {
      normalizedRole,
      clerkIsAdmin: !!clerkIsAdmin,
      isFullAdmin: true,
      nav: { ...NAV_ALL },
    }
  }

  if (normalizedRole === 'caretaker') {
    return {
      normalizedRole,
      clerkIsAdmin: false,
      isFullAdmin: false,
      nav: {
        home: true,
        inspections: true,
        inspectionsAdHoc: false,
        actions: true,
        templates: true,
        import: false,
        guides: true,
        settings: false,
        downloads: false,
        analytics: true,
        inspectionReports: true,
      },
    }
  }

  if (normalizedRole === 'resident') {
    return {
      normalizedRole,
      clerkIsAdmin: false,
      isFullAdmin: false,
      nav: {
        home: true,
        inspections: true,
        inspectionsAdHoc: false,
        actions: false,
        templates: true,
        import: false,
        guides: true,
        settings: false,
        downloads: false,
        analytics: false,
        inspectionReports: false,
      },
    }
  }

  if (normalizedRole === 'housing_officer') {
    return {
      normalizedRole,
      clerkIsAdmin: false,
      isFullAdmin: false,
      nav: {
        home: true,
        inspections: true,
        inspectionsAdHoc: false,
        actions: true,
        templates: true,
        import: false,
        guides: true,
        settings: false,
        downloads: false,
        analytics: true,
        inspectionReports: true,
      },
    }
  }

  if (normalizedRole === 'esm') {
    return {
      normalizedRole,
      clerkIsAdmin: false,
      isFullAdmin: false,
      nav: {
        home: true,
        inspections: true,
        inspectionsAdHoc: false,
        actions: true,
        templates: false,
        import: false,
        guides: true,
        settings: false,
        downloads: false,
        analytics: true,
        inspectionReports: true,
      },
    }
  }

  return {
    normalizedRole,
    clerkIsAdmin: false,
    isFullAdmin: false,
    nav: {
      home: true,
      inspections: true,
      inspectionsAdHoc: false,
      actions: true,
      templates: false,
      import: false,
      guides: true,
      settings: false,
      downloads: false,
      analytics: false,
      inspectionReports: false,
    },
  }
}

export function roleMayViewGlobalActionsList(normalizedRole, clerkIsAdmin) {
  if (isPrivilegedAdmin(normalizedRole, clerkIsAdmin)) return true
  if (normalizedRole === 'resident') return false
  return true
}

export function roleMayPostManualAction(normalizedRole, clerkIsAdmin) {
  if (isPrivilegedAdmin(normalizedRole, clerkIsAdmin)) return true
  if (normalizedRole === 'esm' || normalizedRole === 'resident') return false
  return ['caretaker', 'housing_officer'].includes(normalizedRole)
}
