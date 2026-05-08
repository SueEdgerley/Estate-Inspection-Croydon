/**
 * Access model:
 * - users.system_role controls permissions (owner/admin/user).
 * - people.job_title controls operational form visibility and workflow grouping.
 */

import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '@/lib/db'
import { isNeighbourhoodVoiceTemplate } from '@/lib/airtable-client'
import { isCaretakerTemplate } from '@/lib/caretaker-template'
import { isEstateWalkaboutTemplate } from '@/lib/estate-walkabout-template'
import { isEsmInspectionFormTemplate } from '@/lib/esm-inspection-form'
import { APP_ACCESS_ROLES } from '@/lib/app-access-roles'

/** Current system roles shown in Settings. These control permissions only. */
export { APP_ACCESS_ROLES }

/** Values allowed by PATCH /api/admin/users/:id. */
export const ASSIGNABLE_APP_ROLES = APP_ACCESS_ROLES

/**
 * Normalize legacy / aliases for permission checks.
 * @param {string|null|undefined} raw
 * @returns {string}
 */
export function normalizeAppRole(raw) {
  const r = String(raw || '').toLowerCase().trim().replace(/[\s-]+/g, '_')
  if (r === 'owner') return 'owner'
  if (r === 'admins' || r === 'admin') return 'admin'
  return 'user'
}

export function normalizeJobTitle(raw) {
  const r = String(raw || '').toLowerCase().trim().replace(/[\s-]+/g, '_')
  if (r === 'housingofficer') return 'housing_officer'
  if (r === 'housing_officer' || r === 'housing_officers') return 'housing_officer'
  if (r === 'estate_services_manager' || r === 'estate_service_manager') return 'esm'
  if (r === 'caretaker' || r === 'caretakers') return 'caretaker'
  if (r === 'resident' || r === 'residents') return 'resident'
  if (r === 'neighbourhood_voice' || r === 'neighbourhood_voices' || r === 'nv') return 'resident'
  if (r === 'resident_representative') return 'resident'
  if (r === 'esm') return 'esm'
  return r || ''
}

function firstMetadataValue(metadata, keys) {
  if (!metadata || typeof metadata !== 'object') return null
  for (const key of keys) {
    const value = metadata[key]
    if (value != null && String(value).trim()) return String(value).trim()
  }
  return null
}

function getClerkMetadataRoleFallbacks(metadata) {
  const rawSystemRole = firstMetadataValue(metadata, [
    'system_role',
    'systemRole',
    'app_role',
    'appRole',
    'role',
  ])
  const normalizedSystem = normalizeAppRole(rawSystemRole)
  const systemRole =
    rawSystemRole && ['owner', 'admin', 'user'].includes(normalizedSystem)
      ? rawSystemRole
      : null

  const rawJobTitle =
    firstMetadataValue(metadata, [
      'job_title',
      'jobTitle',
      'operational_role',
      'operationalRole',
      'staff_role',
      'staffRole',
    ]) ||
    (rawSystemRole && normalizeJobTitle(rawSystemRole) ? rawSystemRole : null)

  return {
    systemRole,
    jobTitle: rawJobTitle,
  }
}

/**
 * @param {string} normalizedRole
 * @param {boolean} clerkIsAdmin
 */
export function isPrivilegedAdmin(normalizedRole, clerkIsAdmin) {
  if (clerkIsAdmin) return true
  return normalizedRole === 'owner' || normalizedRole === 'admin'
}

export function roleMaySeeAllForms(normalizedRole, clerkIsAdmin) {
  return isPrivilegedAdmin(normalizedRole, clerkIsAdmin)
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
  if (roleMaySeeAllForms(normalizedRole, clerkIsAdmin)) return true
  const jobTitle = normalizeJobTitle(normalizedRole)
  if (jobTitle === 'esm') return isEsmInspectionFormTemplate(template)
  if (jobTitle === 'caretaker') return isCaretakerTemplate(template)
  if (jobTitle === 'resident') return isNeighbourhoodVoiceTemplate(template)
  // Housing Officer-specific forms can be added here; Walkabout is available now.
  if (jobTitle === 'housing_officer') return isEstateWalkaboutTemplate(template)
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
 * @param {{ userId: string|null, appRole?: string|null, systemRole?: string|null, jobTitle?: string|null, clerkIsAdmin: boolean }} viewer
 */
export function filterTemplatesForAppRole(templates, viewer) {
  const list = Array.isArray(templates) ? templates : []
  if (!viewer?.userId) return []

  const raw = viewer.systemRole ?? viewer.appRole
  const clerkIsAdmin = viewer.clerkIsAdmin === true
  const role = normalizeAppRole(raw)
  const jobTitle = normalizeJobTitle(viewer.jobTitle)

  // DEBUG: Log role/job_title and template filtering
  console.log('[filterTemplatesForAppRole]', {
    system_role: role,
    job_title: jobTitle,
    raw_system_role: raw,
    raw_job_title: viewer.jobTitle,
    clerk_is_admin: clerkIsAdmin,
    templates_before_filter: list.length,
  })

  if (roleMaySeeAllForms(role, clerkIsAdmin)) return list

  if (jobTitle === 'caretaker') {
    const result = list.filter((t) => isCaretakerTemplate(t))
    console.log('[filterTemplatesForAppRole] caretaker filter result:', result.length, 'templates')
    return result
  }
  if (jobTitle === 'resident') {
    const result = list.filter((t) => isNeighbourhoodVoiceTemplate(t))
    console.log('[filterTemplatesForAppRole] resident filter result:', result.length, 'templates')
    return result
  }
  if (jobTitle === 'housing_officer') {
    const result = list.filter((t) => isEstateWalkaboutTemplate(t))
    console.log('[filterTemplatesForAppRole] housing_officer filter result:', result.length, 'templates')
    return result
  }
  if (jobTitle === 'esm') {
    const result = list.filter((t) => isEsmInspectionFormTemplate(t))
    console.log('[filterTemplatesForAppRole] esm filter result:', result.length, 'templates')
    return result
  }

  // TEMPORARY DEMO FIX: Allow any signed-in user without a job_title to see all forms.
  // This enables new sign-up users to access forms during testing.
  // After demo: revert the final 'return list' back to 'return []'
  console.log('[filterTemplatesForAppRole] no matching job_title - returning:', list.length, 'templates (DEMO FIX)')
  return list
}

/**
 * Serialisable flags for /api/auth/me (client nav).
 * @param {string|null|undefined} rawRole
 * @param {boolean} clerkIsAdmin
 */
/**
 * Postgres system role + linked operational job title for a Clerk user id.
 * @returns {Promise<{ raw: string | null, rawSystemRole: string | null, systemRole: string, rawJobTitle: string | null, jobTitle: string, normalized: string, clerkIsAdmin: boolean }>}
 */
export async function getAppRoleContextForClerkUser(clerkUserId, clerkIsAdminFromClerk = false, clerkMetadata = null) {
  if (!clerkUserId) {
    return { raw: null, rawSystemRole: null, systemRole: 'user', rawJobTitle: null, jobTitle: '', normalized: '', clerkIsAdmin: !!clerkIsAdminFromClerk }
  }
  let rawSystemRole = null
  let rawJobTitle = null
  const metadataFallbacks = getClerkMetadataRoleFallbacks(clerkMetadata)
  try {
    if (getPgUrl()) {
      await ensureDatabase()
      const r = await sql`
        SELECT
          CASE
            WHEN lower(trim(COALESCE(u.role, ''))) = 'owner' THEN 'owner'
            WHEN lower(trim(COALESCE(u.system_role, u.role, ''))) = 'admin' THEN 'admin'
            ELSE 'user'
          END AS system_role,
          COALESCE(
            p.job_title,
            CASE
              WHEN lower(trim(COALESCE(u.role, u.system_role, ''))) IN ('caretaker', 'caretakers') THEN 'Caretaker'
              WHEN lower(trim(COALESCE(u.role, u.system_role, ''))) IN ('housing officer', 'housing_officer', 'housing officers', 'housing_officers') THEN 'Housing Officer'
              WHEN lower(trim(COALESCE(u.role, u.system_role, ''))) IN ('estate services manager', 'estate_services_manager', 'estate service manager', 'estate_service_manager', 'esm') THEN 'ESM'
              ELSE NULL
            END
          ) AS job_title
        FROM users u
        LEFT JOIN people p ON p.id = u.people_id OR lower(trim(p.email)) = lower(trim(COALESCE(u.email, '')))
        WHERE u.clerk_user_id = ${clerkUserId}
        ORDER BY CASE WHEN p.id = u.people_id THEN 0 ELSE 1 END
        LIMIT 1
      `
      rawSystemRole = r.rows[0]?.system_role ?? null
      rawJobTitle = r.rows[0]?.job_title ?? null
    }
  } catch {
    /* ignore */
  }
  rawSystemRole = rawSystemRole || metadataFallbacks.systemRole
  rawJobTitle = rawJobTitle || metadataFallbacks.jobTitle
  const systemRole = normalizeAppRole(rawSystemRole)
  const jobTitle = normalizeJobTitle(rawJobTitle)
  return {
    raw: rawSystemRole,
    rawSystemRole,
    systemRole,
    rawJobTitle,
    jobTitle,
    normalized: isPrivilegedAdmin(systemRole, !!clerkIsAdminFromClerk) ? systemRole : jobTitle,
    clerkIsAdmin: !!clerkIsAdminFromClerk,
  }
}

const NAV_ALL = {
  home: true,
  caretakerStart: false,
  inspections: true,
  inspectionsAdHoc: false,
  actions: true,
  repairsInspector: true,
  repairsInspectorForm: true,
  templates: true,
  import: false,
  guides: true,
  settings: true,
  downloads: true,
  analytics: true,
  inspectionReports: true,
}

const NAV_LIMITED = {
  home: true,
  caretakerStart: false,
  inspections: true,
  inspectionsAdHoc: false,
  actions: true,
  repairsInspector: false,
  repairsInspectorForm: false,
  templates: true,
  import: false,
  guides: true,
  settings: false,
  downloads: false,
  analytics: false,
  inspectionReports: false,
}

/**
 * Manager / HOS / ESM-style access to Neon-backed inspection aggregates (not residents).
 */
export function mayViewInspectionReports(normalizedRole, clerkIsAdmin) {
  if (isPrivilegedAdmin(normalizedRole, clerkIsAdmin)) return true
  return false
}

/** Analytics dashboard (Neon aggregates) — same cohort as inspection reports. */
export function mayViewManagerAnalytics(normalizedRole, clerkIsAdmin) {
  return mayViewInspectionReports(normalizedRole, clerkIsAdmin)
}

export function getRoleUiFlags(rawSystemRole, clerkIsAdmin, rawJobTitle = '') {
  const systemRole = normalizeAppRole(rawSystemRole)
  const jobTitle = normalizeJobTitle(rawJobTitle)
  const normalizedRole = isPrivilegedAdmin(systemRole, !!clerkIsAdmin) ? systemRole : jobTitle
  if (isPrivilegedAdmin(systemRole, !!clerkIsAdmin)) {
    return {
      normalizedRole,
      systemRole,
      jobTitle,
      clerkIsAdmin: !!clerkIsAdmin,
      isFullAdmin: true,
      nav: { ...NAV_ALL },
    }
  }

  if (normalizedRole === 'caretaker') {
    return {
      normalizedRole,
      systemRole,
      jobTitle,
      clerkIsAdmin: false,
      isFullAdmin: false,
      nav: {
        home: false,
        caretakerStart: false,
        inspections: false,
        inspectionsAdHoc: false,
        actions: false,
        repairsInspector: false,
        repairsInspectorForm: false,
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

  if (normalizedRole === 'resident') {
    return {
      normalizedRole,
      systemRole,
      jobTitle,
      clerkIsAdmin: false,
      isFullAdmin: false,
      nav: {
        home: true,
        inspections: false,
        inspectionsAdHoc: false,
        actions: false,
        repairsInspector: true,
        repairsInspectorForm: true,
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
      systemRole,
      jobTitle,
      clerkIsAdmin: false,
      isFullAdmin: false,
      nav: {
        home: true,
        inspections: true,
        inspectionsAdHoc: false,
        actions: true,
        repairsInspector: false,
        repairsInspectorForm: false,
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

  if (normalizedRole === 'esm') {
    return {
      normalizedRole,
      systemRole,
      jobTitle,
      clerkIsAdmin: false,
      isFullAdmin: false,
      nav: {
        home: true,
        inspections: true,
        inspectionsAdHoc: false,
        actions: true,
        repairsInspector: true,
        repairsInspectorForm: true,
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

  return {
    normalizedRole,
    systemRole,
    jobTitle,
    clerkIsAdmin: false,
    isFullAdmin: false,
    accessMessage:
      'Limited access: no app role or job title has been assigned. Ask an administrator to assign your role if you need more access.',
    nav: { ...NAV_LIMITED },
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
