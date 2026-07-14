import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl, getNeonQuery, pgPublicTableExists } from '@/lib/db'
import { ensureClerkUserProvisioned } from '@/lib/ensure-clerk-user-provisioned'
import { getCurrentUserEmail, getCurrentUserName, isAdmin } from '@/lib/auth'
import {
  homePeriodPresetLabel,
  resolveAnalyticsPresetDates,
} from '@/lib/analytics-date-presets'
import {
  aliasInspectionWhereClause,
  buildInspectionWhereConditions,
  joinSqlAnd,
} from '@/lib/inspection-filters'
import { WORK_TYPE_VALUES, workTypeLabel } from '@/lib/inspection-work-types'

// Match /api/dashboard auth: system role or operational job titles.
const ALLOWED_DASHBOARD_JOB_TITLES = ['caretaker', 'housing_officer', 'housing_team_manager', 'esm']
const TEMPORARILY_DISABLE_ESTATE_SCOPING = true

/** Open backlog statuses — aligned with Actions UI + inspections open_issues_count. */
const OPEN_ACTION_STATUS_SQL = `lower(trim(COALESCE(status, ''))) IN ('open', 'in_progress', 'in progress')`
const OPEN_ACTION_STATUS_ALIASED = `lower(trim(COALESCE(a.status, ''))) IN ('open', 'in_progress', 'in progress')`

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function isUsersTableMissing(err) {
  if (!err) return false
  const code = err.code
  const msg = (err.message || '').toLowerCase()
  return code === '42P01' || msg.includes('does not exist') || msg.includes('relation "users"')
}

function logHomeOverviewAuth(clerkUserId, email, internalUser, role, assignedEstateCount, statusCode, reason) {
  console.log('[HomeOverview] auth:', {
    clerkUserId: clerkUserId ?? null,
    email: email ?? null,
    internalUser: internalUser ?? null,
    role: role ?? null,
    is_active: internalUser?.is_active ?? null,
    assignedEstateCount: assignedEstateCount ?? null,
    statusCode,
    reason: reason ?? null,
  })
}

function emptyOverview(applied, message) {
  return {
    applied,
    kpis: {
      inspectionsCompleted: 0,
      openActions: 0,
      overdueActions: 0,
      blocksInspected: 0,
      estatesInspected: 0,
    },
    byWorkType: WORK_TYPE_VALUES.map((workType) => ({
      workType,
      label: workTypeLabel(workType),
      count: 0,
    })),
    topInspectors: [],
    latestInspections: [],
    latestOpenActions: [],
    links: {
      analytics: '/analytics',
      inspections: '/inspections',
      actions: '/actions',
    },
    ...(message ? { message } : {}),
  }
}

function resolveHomePreset(searchParams) {
  const raw = String(searchParams.get('preset') || 'month').trim().toLowerCase()
  const allowed = new Set(['month', 'last_30', 'last30', '30d', 'year', 'this_year', 'all', 'all_time'])
  const preset = allowed.has(raw) ? raw : 'month'
  const resolved = resolveAnalyticsPresetDates(new URLSearchParams({ preset }))
  return {
    preset: resolved.preset,
    label: homePeriodPresetLabel(resolved.preset),
    dateFrom: resolved.dateFrom,
    dateTo: resolved.dateTo,
  }
}

function formatRangeLabel(applied) {
  if (applied.preset === 'all' || (!applied.dateFrom && !applied.dateTo)) {
    return `${applied.label} (all recorded dates)`
  }
  if (applied.dateFrom && applied.dateTo) {
    return `${applied.label} (${applied.dateFrom} to ${applied.dateTo})`
  }
  if (applied.dateFrom) return `${applied.label} (from ${applied.dateFrom})`
  if (applied.dateTo) return `${applied.label} (to ${applied.dateTo})`
  return applied.label
}

export async function GET(request) {
  const authResult = await auth()
  const clerkUserId = authResult?.userId ?? null
  let userEmail = null
  try {
    userEmail = await getCurrentUserEmail()
  } catch (e) {
    console.warn('[HomeOverview] getCurrentUserEmail failed:', e?.message)
  }

  try {
    if (!clerkUserId) {
      logHomeOverviewAuth(clerkUserId, userEmail, null, null, null, 401, 'Missing clerk userId')
      return NextResponse.json(
        { error: 'Unauthorized', code: 'UNAUTHORIZED', reason: 'Not signed in' },
        { status: 401 }
      )
    }

    await ensureDatabase()
    try {
      let displayName = null
      try {
        displayName = await getCurrentUserName()
      } catch {
        displayName = null
      }
      await ensureClerkUserProvisioned(clerkUserId, userEmail, { displayName })
    } catch (provErr) {
      console.warn('[HomeOverview] User provision failed:', provErr.message)
      if (isUsersTableMissing(provErr)) {
        logHomeOverviewAuth(clerkUserId, userEmail, null, null, null, 500, 'DB not migrated')
        return NextResponse.json(
          {
            error: 'DB not migrated',
            code: 'DB_NOT_MIGRATED',
            message: 'Database migrations have not been run. Run: prisma migrate deploy',
          },
          { status: 500 }
        )
      }
    }

    const pgUrl = getPgUrl()
    if (!pgUrl) {
      logHomeOverviewAuth(clerkUserId, userEmail, null, null, null, 503, 'Database not configured')
      return NextResponse.json(
        { error: 'Database not configured. Please set up Postgres.' },
        { status: 503 }
      )
    }

    let userResult
    try {
      userResult = await sql`
        SELECT
          u.id,
          u.clerk_user_id,
          u.email,
          CASE
            WHEN lower(trim(COALESCE(u.role, ''))) = 'owner' THEN 'owner'
            WHEN lower(trim(COALESCE(u.system_role, u.role, ''))) = 'admin' THEN 'admin'
            ELSE 'user'
          END AS system_role,
          p.job_title,
          COALESCE(u.is_active, true) AS is_active
        FROM users u
        LEFT JOIN people p ON p.id = u.people_id OR lower(trim(p.email)) = lower(trim(COALESCE(u.email, '')))
        WHERE u.clerk_user_id = ${clerkUserId}
        ORDER BY CASE WHEN p.id = u.people_id THEN 0 ELSE 1 END
        LIMIT 1
      `
    } catch (e) {
      console.error('[HomeOverview] users table lookup failed:', e.message)
      if (isUsersTableMissing(e)) {
        logHomeOverviewAuth(clerkUserId, userEmail, null, null, null, 500, 'DB not migrated')
        return NextResponse.json(
          {
            error: 'DB not migrated',
            code: 'DB_NOT_MIGRATED',
            message: 'Database migrations have not been run. Run: prisma migrate deploy',
          },
          { status: 500 }
        )
      }
      logHomeOverviewAuth(clerkUserId, userEmail, null, null, null, 500, 'Users table lookup failed')
      return NextResponse.json({ error: 'Failed to resolve user', details: e.message }, { status: 500 })
    }

    const internalUser = userResult.rows[0] || null
    if (!internalUser) {
      logHomeOverviewAuth(clerkUserId, userEmail, null, null, null, 403, 'USER_NOT_PROVISIONED')
      return NextResponse.json(
        {
          error: 'User not provisioned',
          code: 'USER_NOT_PROVISIONED',
          reason: 'No internal user row for this Clerk user',
        },
        { status: 403 }
      )
    }

    if (internalUser.is_active === false) {
      logHomeOverviewAuth(clerkUserId, userEmail, internalUser, internalUser.system_role, null, 403, 'USER_INACTIVE')
      return NextResponse.json(
        { error: 'User inactive', code: 'USER_INACTIVE', reason: 'Account is inactive' },
        { status: 403 }
      )
    }

    const systemRole = (internalUser.system_role || 'user').toLowerCase().trim()
    const jobTitle = String(internalUser.job_title || '')
      .toLowerCase()
      .trim()
      .replace(/[\s-]+/g, '_')
    const clerkAdminUser = await isAdmin()
    if (
      systemRole !== 'owner' &&
      systemRole !== 'admin' &&
      !ALLOWED_DASHBOARD_JOB_TITLES.includes(jobTitle) &&
      !clerkAdminUser
    ) {
      logHomeOverviewAuth(clerkUserId, userEmail, internalUser, systemRole, null, 403, 'ROLE_NOT_PERMITTED')
      return NextResponse.json(
        {
          error: 'Access denied',
          code: 'ROLE_NOT_PERMITTED',
          reason: jobTitle
            ? 'Your job title does not have dashboard access.'
            : 'No job title assigned. Ask an admin to assign your staff job title.',
        },
        { status: 403 }
      )
    }

    let assignedEstateCount = 0
    if (await pgPublicTableExists('user_estate_assignments')) {
      const countResult = await sql`
        SELECT COUNT(*)::int AS c FROM user_estate_assignments WHERE user_id = ${internalUser.id}
      `
      assignedEstateCount = countResult.rows[0]?.c ?? 0
    }

    const admin = systemRole === 'owner' || systemRole === 'admin' || clerkAdminUser
    const { searchParams } = new URL(request.url)
    const appliedBase = resolveHomePreset(searchParams)
    const applied = {
      ...appliedBase,
      rangeLabel: formatRangeLabel(appliedBase),
    }

    // Match /api/dashboard: non-admin with no estate assignments still gets 200 + empty payload.
    if (!admin && assignedEstateCount === 0) {
      logHomeOverviewAuth(clerkUserId, userEmail, internalUser, systemRole, assignedEstateCount, 200, 'ok_no_estates')
      return NextResponse.json(emptyOverview(applied, 'No estates assigned yet.'))
    }

    const whereConditions = buildInspectionWhereConditions({
      completionScope: 'completed',
      dateField: 'submitted_at',
      dateFrom: applied.dateFrom,
      dateTo: applied.dateTo,
      type: 'all',
      template: 'all',
      workType: 'all',
      role: 'all',
      estateId: '',
      blockId: '',
      inspector: 'all',
      scheduled: 'all',
      grading: 'all',
      admin,
      fallbackInspectorId: !TEMPORARILY_DISABLE_ESTATE_SCOPING ? internalUser.email : null,
    })
    const [whereText, whereParams] = joinSqlAnd(whereConditions)
    const whereInspectionAlias = aliasInspectionWhereClause(whereText, 'i')
    const run = getNeonQuery()

    const kpiResult = await run(
      `SELECT
        COUNT(*)::int AS inspections_completed,
        COUNT(DISTINCT block_id) FILTER (WHERE block_id IS NOT NULL)::int AS blocks_inspected,
        COUNT(DISTINCT estate_id) FILTER (WHERE estate_id IS NOT NULL)::int AS estates_inspected
      FROM inspections
      WHERE ${whereText}`,
      whereParams
    )

    const byWorkTypeResult = await run(
      `SELECT
        COALESCE(NULLIF(trim(work_type), ''), '(unknown)') AS work_type,
        COUNT(*)::int AS completed_count
      FROM inspections
      WHERE ${whereText}
      GROUP BY 1
      ORDER BY completed_count DESC, work_type ASC`,
      whereParams
    )

    const topInspectorsResult = await run(
      `SELECT
        COALESCE(
          NULLIF(trim(p.name), ''),
          NULLIF(trim(i.inspector_name), ''),
          NULLIF(trim(i.inspector_id), ''),
          '(unknown)'
        ) AS person_label,
        COALESCE(NULLIF(trim(i.inspector_id), ''), '') AS person_id,
        COALESCE(NULLIF(trim(p.job_title), ''), NULLIF(trim(p.role), ''), '') AS role_label,
        COUNT(*)::int AS completed_count
      FROM inspections i
      LEFT JOIN people p ON lower(trim(p.email)) = lower(trim(i.inspector_id))
      WHERE ${whereInspectionAlias}
      GROUP BY 1, 2, 3
      ORDER BY completed_count DESC, person_label ASC
      LIMIT 5`,
      whereParams
    )

    const latestInspectionsResult = await run(
      `SELECT
        i.id,
        i.submitted_at,
        i.work_type,
        i.inspector_name,
        i.inspector_id,
        i.template_name,
        i.location_label,
        e.name AS estate_name,
        b.name AS block_name,
        COALESCE(
          NULLIF(CONCAT_WS(' / ', NULLIF(trim(e.name), ''), NULLIF(trim(b.name), '')), ''),
          CASE
            WHEN lower(trim(COALESCE(i.location_label, ''))) IN (
              lower(trim(COALESCE(i.template_name, ''))),
              lower(trim(COALESCE(i.type, ''))),
              lower(trim(COALESCE(i.title, '')))
            ) THEN NULL
            ELSE NULLIF(trim(i.location_label), '')
          END,
          NULLIF(trim(i.title), ''),
          'Location pending'
        ) AS location_display
      FROM inspections i
      LEFT JOIN estates e ON e.id = i.estate_id
      LEFT JOIN blocks b ON b.id = i.block_id
      WHERE ${whereInspectionAlias}
      ORDER BY i.submitted_at DESC NULLS LAST
      LIMIT 5`,
      whereParams
    )

    let openActions = 0
    let overdueActions = 0
    let latestOpenActions = []
    const hasActions = await pgPublicTableExists('actions')
    if (hasActions) {
      const actionCounts = await run(
        `SELECT
          COUNT(*) FILTER (WHERE ${OPEN_ACTION_STATUS_SQL})::int AS open_count,
          COUNT(*) FILTER (
            WHERE ${OPEN_ACTION_STATUS_SQL}
              AND expected_completion_date IS NOT NULL
              AND expected_completion_date < CURRENT_DATE
          )::int AS overdue_count
        FROM actions`
      )
      openActions = parseInt(actionCounts.rows[0]?.open_count || 0, 10)
      overdueActions = parseInt(actionCounts.rows[0]?.overdue_count || 0, 10)

      const latestOpen = await run(
        `SELECT
          a.id,
          a.inspection_id,
          a.title,
          a.status,
          a.priority,
          a.expected_completion_date,
          a.created_at,
          a.location,
          p.name AS assigned_to,
          e.name AS estate_name,
          b.name AS block_name,
          COALESCE(
            NULLIF(CONCAT_WS(' / ', NULLIF(trim(e.name), ''), NULLIF(trim(b.name), '')), ''),
            NULLIF(trim(a.location), ''),
            CASE
              WHEN lower(trim(COALESCE(i.location_label, ''))) IN (
                lower(trim(COALESCE(i.template_name, ''))),
                lower(trim(COALESCE(i.type, ''))),
                lower(trim(COALESCE(i.title, '')))
              ) THEN NULL
              ELSE NULLIF(trim(i.location_label), '')
            END,
            'Location pending'
          ) AS location_display,
          (
            ${OPEN_ACTION_STATUS_ALIASED}
            AND a.expected_completion_date IS NOT NULL
            AND a.expected_completion_date < CURRENT_DATE
          ) AS is_overdue
        FROM actions a
        LEFT JOIN inspections i ON i.id = a.inspection_id
        LEFT JOIN blocks b ON b.id = COALESCE(a.block_id, i.block_id)
        LEFT JOIN estates e ON e.id = COALESCE(b.estate_id, i.estate_id)
        LEFT JOIN people p ON p.id = a.recipient_person_id
        WHERE ${OPEN_ACTION_STATUS_ALIASED}
        ORDER BY
          CASE
            WHEN a.expected_completion_date IS NOT NULL AND a.expected_completion_date < CURRENT_DATE THEN 0
            ELSE 1
          END,
          CASE lower(trim(COALESCE(a.priority, '')))
            WHEN 'urgent' THEN 0
            WHEN 'high' THEN 1
            WHEN 'medium' THEN 2
            WHEN 'low' THEN 3
            ELSE 4
          END,
          a.expected_completion_date ASC NULLS LAST,
          a.created_at DESC
        LIMIT 5`
      )
      latestOpenActions = latestOpen.rows.map((row) => ({
        id: row.id,
        inspectionId: row.inspection_id,
        title: row.title || 'Untitled action',
        status: row.status || 'open',
        priority: row.priority || null,
        expectedCompletionDate: row.expected_completion_date
          ? String(row.expected_completion_date).slice(0, 10)
          : null,
        createdAt: row.created_at || null,
        assignedTo: row.assigned_to || null,
        locationLabel: row.location_display || 'Location pending',
        estateName: row.estate_name || null,
        blockName: row.block_name || null,
        isOverdue: Boolean(row.is_overdue),
      }))
    }

    const workTypeCounts = new Map(
      byWorkTypeResult.rows.map((row) => [String(row.work_type || ''), parseInt(row.completed_count || 0, 10)])
    )
    const byWorkType = WORK_TYPE_VALUES.map((workType) => ({
      workType,
      label: workTypeLabel(workType),
      count: workTypeCounts.get(workType) || 0,
    }))
    // Include any unexpected work_type values so totals still reconcile.
    for (const [workType, count] of workTypeCounts.entries()) {
      if (!WORK_TYPE_VALUES.includes(workType) && workType !== '(unknown)') {
        byWorkType.push({
          workType,
          label: workTypeLabel(workType),
          count,
        })
      } else if (workType === '(unknown)' && count > 0) {
        byWorkType.push({ workType: '', label: 'Unknown', count })
      }
    }

    const payload = {
      applied,
      kpis: {
        inspectionsCompleted: parseInt(kpiResult.rows[0]?.inspections_completed || 0, 10),
        openActions,
        overdueActions,
        blocksInspected: parseInt(kpiResult.rows[0]?.blocks_inspected || 0, 10),
        estatesInspected: parseInt(kpiResult.rows[0]?.estates_inspected || 0, 10),
      },
      byWorkType,
      topInspectors: topInspectorsResult.rows.map((row) => ({
        personLabel: row.person_label,
        personId: row.person_id || '',
        roleLabel: row.role_label || '',
        completedCount: parseInt(row.completed_count || 0, 10),
      })),
      latestInspections: latestInspectionsResult.rows.map((row) => ({
        id: row.id,
        submittedAt: row.submitted_at || null,
        workType: row.work_type || null,
        workTypeLabel: workTypeLabel(row.work_type),
        inspectorName: row.inspector_name || row.inspector_id || null,
        templateName: row.template_name || null,
        locationLabel: row.location_display || 'Location pending',
        estateName: row.estate_name || null,
        blockName: row.block_name || null,
      })),
      latestOpenActions,
      links: {
        analytics: '/analytics',
        inspections: '/inspections',
        actions: '/actions',
      },
    }

    logHomeOverviewAuth(clerkUserId, userEmail, internalUser, systemRole, assignedEstateCount, 200, 'ok')
    return NextResponse.json(payload)
  } catch (error) {
    console.error('Error fetching home overview:', error)
    return NextResponse.json(
      { error: 'Failed to fetch home overview', details: error.message },
      { status: 500 }
    )
  }
}
