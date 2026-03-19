import { auth, currentUser } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getAirtableUserByClerkId, getAirtableUserByEmail } from '@/lib/airtable-client'

export const APP_ROLES = {
  ADMIN: 'admin',
  EDITOR: 'editor',
  TEMPLATES: 'templates',
}

const VALID_APP_ROLES = new Set([APP_ROLES.ADMIN, APP_ROLES.EDITOR, APP_ROLES.TEMPLATES])
const LOWEST_APP_ROLE = APP_ROLES.TEMPLATES
const APP_ROLE_ALIASES = {
  administrator: APP_ROLES.ADMIN,
  editors: APP_ROLES.EDITOR,
  template: APP_ROLES.TEMPLATES,
  'templates only': APP_ROLES.TEMPLATES,
  'templates-only': APP_ROLES.TEMPLATES,
  viewer: APP_ROLES.TEMPLATES,
  'read only': APP_ROLES.TEMPLATES,
  'read-only': APP_ROLES.TEMPLATES,
}
const AD_HOC_PERMISSION_FIELDS = [
  'canCreateAdHocInspection',
  'Can Create Ad Hoc Inspection',
  'Can Create Adhoc Inspection',
  'Can Create Ad Hoc',
  'Can Create AdHoc Inspection',
]

// Mapping is kept for visibility/migration checks only; authorization uses appRole.
export const JOB_TITLE_TO_APP_ROLE = {
  'housing manager': APP_ROLES.ADMIN,
  'estates services manager': APP_ROLES.ADMIN,
  'head of service': APP_ROLES.ADMIN,
  'housing officer': APP_ROLES.EDITOR,
  'repairs inspector': APP_ROLES.EDITOR,
  caretaker: APP_ROLES.EDITOR,
}

function pickField(record, keys) {
  for (const key of keys) {
    if (record?.[key] !== undefined && record?.[key] !== null) return record[key]
  }
  return null
}

function toStringOrNull(value) {
  if (value == null) return null
  const str = String(value).trim()
  return str || null
}

function toStringArray(value) {
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean)
  }
  if (value == null) return []
  return String(value)
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
}

function parseBooleanish(value) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const parsed = parseBooleanish(item)
      if (parsed !== null) return parsed
    }
    return null
  }
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (value === 1) return true
    if (value === 0) return false
    return null
  }
  if (value == null) return null
  const normalized = String(value).trim().toLowerCase()
  if (!normalized) return null
  if (['true', 'yes', 'y', '1', 'allow', 'allowed', 'enabled'].includes(normalized)) return true
  if (['false', 'no', 'n', '0', 'deny', 'denied', 'blocked', 'disabled'].includes(normalized)) return false
  return null
}

function normalizeAppRole(rawRole) {
  const normalized = toStringOrNull(rawRole)?.toLowerCase()
  const mapped = normalized ? APP_ROLE_ALIASES[normalized] || normalized : null
  const cleaned = mapped ? mapped.replace(/[_\s]+/g, '_').replace(/-+/g, '_') : null
  const canonical = cleaned === 'templates_only' ? APP_ROLES.TEMPLATES : cleaned
  return canonical && VALID_APP_ROLES.has(canonical) ? canonical : null
}

function getPrimaryEmail(user) {
  return (
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses?.[0]?.emailAddress ??
    null
  )
}

function getAssignedScopes(airtableUser) {
  return {
    estates: toStringArray(
      pickField(airtableUser, ['assignedEstates', 'Assigned Estates', 'Assigned Estate', 'Estates', 'Estate'])
    ),
    areas: toStringArray(
      pickField(airtableUser, ['assignedAreas', 'Assigned Areas', 'Assigned Area', 'Areas', 'Area'])
    ),
  }
}

function resolveAdHocCreatePermission(airtableUser, appRole) {
  // Admins always retain ad hoc create capability.
  if (appRole === APP_ROLES.ADMIN) {
    return { canCreateAdHocInspection: true, adHocPermissionSource: 'appRole.admin' }
  }

  const explicit = parseBooleanish(pickField(airtableUser, AD_HOC_PERMISSION_FIELDS))
  if (explicit !== null) {
    return { canCreateAdHocInspection: explicit, adHocPermissionSource: 'airtable.user_override' }
  }

  if (appRole === APP_ROLES.EDITOR) {
    return { canCreateAdHocInspection: true, adHocPermissionSource: 'default.editor_allowed' }
  }

  return { canCreateAdHocInspection: false, adHocPermissionSource: 'default.non_editor_blocked' }
}

function getClerkIdMatchField(airtableUser, clerkUserId) {
  const candidateFields = ['Users ID', 'Clerk User ID', 'User ID', 'UserID', 'UsersID', 'Clerk ID']
  const target = toStringOrNull(clerkUserId)
  if (!target) return null
  for (const field of candidateFields) {
    const value = toStringOrNull(airtableUser?.[field])
    if (value && value === target) return field
  }
  return null
}

export async function resolveCurrentUserAccess() {
  const { userId } = await auth()
  if (!userId) {
    return {
      isAuthenticated: false,
      denialCode: 'UNAUTHORIZED',
      denialReason: 'Not signed in',
      permissions: {
        admin: false,
        editor: false,
        dashboard: false,
        inspections: false,
        templates: false,
        canCreateAdHocInspection: false,
        canCreateScheduledInspection: false,
      },
      appRole: null,
      email: null,
      airtableUser: null,
      matchedBy: null,
      jobTitle: null,
      assignedScopes: { estates: [], areas: [] },
      warnings: [],
    }
  }

  const clerkUser = await currentUser()
  const email = toStringOrNull(getPrimaryEmail(clerkUser))?.toLowerCase() || null
  console.log('[Permissions] Clerk identity resolved', {
    clerkUserId: userId,
    email,
  })

  let airtableUser = null
  let matchedBy = null

  try {
    airtableUser = await getAirtableUserByClerkId(userId)
    if (airtableUser) {
      const matchedField = getClerkIdMatchField(airtableUser, userId)
      matchedBy = matchedField ? `clerk_user_id:${matchedField}` : 'clerk_user_id'
    }
  } catch (error) {
    console.error('[Permissions] Airtable lookup by Clerk user ID failed', {
      clerkUserId: userId,
      error: error?.message || String(error),
    })
  }

  if (!airtableUser && email) {
    try {
      airtableUser = await getAirtableUserByEmail(email)
      if (airtableUser) matchedBy = 'email'
    } catch (error) {
      console.error('[Permissions] Airtable lookup by email failed', {
        clerkUserId: userId,
        email,
        error: error?.message || String(error),
      })
    }
  }

  if (!airtableUser) {
    console.warn('[Permissions] Access blocked: no matching Airtable Users record', {
      clerkUserId: userId,
      email,
    })
    return {
      isAuthenticated: true,
      clerkUserId: userId,
      email,
      airtableUser: null,
      matchedBy: null,
      appRole: null,
      jobTitle: null,
      assignedScopes: { estates: [], areas: [] },
      warnings: ['NO_AIRTABLE_USER'],
      denialCode: 'NO_AIRTABLE_USER',
      denialReason: 'Signed in with Clerk but no matching Airtable Users record',
      permissions: {
        admin: false,
        editor: false,
        dashboard: false,
        inspections: false,
        templates: false,
        canCreateAdHocInspection: false,
        canCreateScheduledInspection: false,
      },
    }
  }

  const warnings = []
  const rawAppRole = pickField(airtableUser, ['appRole', 'App Role'])
  const jobTitle = toStringOrNull(pickField(airtableUser, ['jobTitle', 'Job Title']))
  const mappedJobTitleRole = jobTitle ? JOB_TITLE_TO_APP_ROLE[jobTitle.toLowerCase()] || null : null

  let appRole = normalizeAppRole(rawAppRole)
  let roleSource = 'airtable.appRole'
  if (!appRole) {
    appRole = LOWEST_APP_ROLE
    roleSource = 'default.lowest'
    warnings.push('INVALID_OR_BLANK_APP_ROLE_DEFAULTED')
    console.warn('[Permissions] Invalid/blank appRole; defaulting to templates-only permissions', {
      clerkUserId: userId,
      email,
      rawAppRole,
      jobTitle,
      mappedJobTitleRole,
    })
  }

  const { canCreateAdHocInspection, adHocPermissionSource } = resolveAdHocCreatePermission(
    airtableUser,
    appRole
  )

  console.log('[Permissions] Airtable user access resolved', {
    clerkUserId: userId,
    email,
    matchedBy,
    airtableUserId: airtableUser?.id ?? null,
    appRole,
    roleSource,
    jobTitle,
    canCreateAdHocInspection,
    adHocPermissionSource,
    warnings,
  })

  const canCreateScheduledInspection = appRole === APP_ROLES.EDITOR || appRole === APP_ROLES.ADMIN
  const canAccessInspections =
    appRole === APP_ROLES.EDITOR ||
    appRole === APP_ROLES.ADMIN ||
    canCreateAdHocInspection ||
    canCreateScheduledInspection

  return {
    isAuthenticated: true,
    clerkUserId: userId,
    email,
    airtableUser,
    matchedBy,
    appRole,
    roleSource,
    jobTitle,
    mappedJobTitleRole,
    assignedScopes: getAssignedScopes(airtableUser),
    warnings,
    denialCode: null,
    denialReason: null,
    permissions: {
      admin: appRole === APP_ROLES.ADMIN,
      editor: appRole === APP_ROLES.EDITOR || appRole === APP_ROLES.ADMIN,
      dashboard: appRole === APP_ROLES.EDITOR || appRole === APP_ROLES.ADMIN,
      inspections: canAccessInspections,
      templates:
        appRole === APP_ROLES.TEMPLATES ||
        appRole === APP_ROLES.EDITOR ||
        appRole === APP_ROLES.ADMIN,
      canCreateAdHocInspection,
      canCreateScheduledInspection,
    },
  }
}

export function buildAccessDeniedResponse(access, options = {}) {
  const {
    requireDashboard = false,
    requireAdmin = false,
    requireAdHocCreate = false,
    requireTemplates = false,
    requireInspections = false,
  } = options

  if (!access?.isAuthenticated) {
    return NextResponse.json(
      { error: 'Unauthorized', code: 'UNAUTHORIZED', reason: 'Not signed in' },
      { status: 401 }
    )
  }

  if (access?.denialCode) {
    return NextResponse.json(
      { error: 'No access', code: access.denialCode, reason: access.denialReason || 'Access denied' },
      { status: 403 }
    )
  }

  if (requireDashboard && !access?.permissions?.dashboard) {
    return NextResponse.json(
      { error: 'No access', code: 'ROLE_NOT_PERMITTED', reason: 'Dashboard access is not permitted' },
      { status: 403 }
    )
  }

  if (requireAdmin && !access?.permissions?.admin) {
    return NextResponse.json(
      { error: 'Forbidden', code: 'ADMIN_REQUIRED', reason: 'Admin role required' },
      { status: 403 }
    )
  }

  if (requireAdHocCreate && !access?.permissions?.canCreateAdHocInspection) {
    return NextResponse.json(
      {
        error: 'Forbidden',
        code: 'AD_HOC_CREATE_NOT_ALLOWED',
        reason: 'You do not have permission to create ad hoc inspections',
      },
      { status: 403 }
    )
  }

  if (requireTemplates && !access?.permissions?.templates) {
    return NextResponse.json(
      {
        error: 'No access',
        code: 'ROLE_NOT_PERMITTED',
        reason: 'Template access is not permitted',
      },
      { status: 403 }
    )
  }

  if (requireInspections && !access?.permissions?.inspections) {
    return NextResponse.json(
      {
        error: 'No access',
        code: 'ROLE_NOT_PERMITTED',
        reason: 'Inspection management access is not permitted',
      },
      { status: 403 }
    )
  }

  return null
}

export async function getRouteAccess(options = {}) {
  const access = await resolveCurrentUserAccess()
  const denialResponse = buildAccessDeniedResponse(access, options)
  return { access, denialResponse }
}
