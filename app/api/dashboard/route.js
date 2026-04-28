import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl, getNeonQuery, pgPublicTableExists } from '@/lib/db'
import { ensureClerkUserProvisioned } from '@/lib/ensure-clerk-user-provisioned'
import { getCurrentUserEmail, getCurrentUserName, isAdmin } from '@/lib/auth'
import { buildInspectionWhereConditions, joinSqlAnd } from '@/lib/inspection-filters'
import { queryInspectionRowsWithPdfColumnFallback } from '@/lib/inspection-list-query-pdf-fallback'

// Permissions come from users.system_role; operational grouping comes from people.job_title.
const ALLOWED_DASHBOARD_JOB_TITLES = ['caretaker', 'housing_officer', 'esm']
// Set to true to show all inspections regardless of inspector/estate (for debugging access)
const TEMPORARILY_DISABLE_ESTATE_SCOPING = true

// Node Postgres client requires Node runtime
export const runtime = "nodejs";
export const dynamic = 'force-dynamic'

function isUsersTableMissing(err) {
  if (!err) return false
  const code = err.code
  const msg = (err.message || '').toLowerCase()
  return code === '42P01' || msg.includes('does not exist') || msg.includes('relation "users"')
}

function logDashboardAuth(clerkUserId, email, internalUser, role, assignedEstateCount, statusCode, reason) {
  console.log('[Dashboard] auth:', {
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

export async function GET(request) {
  // Debug: log full auth() result to verify Clerk is returning userId
  const authResult = await auth()
  const clerkUserId = authResult?.userId ?? null
  let userEmail = null
  try {
    userEmail = await getCurrentUserEmail()
  } catch (e) {
    console.warn('[Dashboard] getCurrentUserEmail failed:', e?.message)
  }

  // Debug logging: these values help verify auth mapping
  console.log('[Dashboard] debug:', {
    clerkUserId,
    email: userEmail,
    authKeys: authResult ? Object.keys(authResult) : [],
  })

  try {
    if (!clerkUserId) {
      logDashboardAuth(clerkUserId, userEmail, null, null, null, 401, 'Missing clerk userId')
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED', reason: 'Not signed in' }, { status: 401 })
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
      console.warn('[Dashboard] User provision failed:', provErr.message)
      if (isUsersTableMissing(provErr)) {
        logDashboardAuth(clerkUserId, userEmail, null, null, null, 500, 'DB not migrated')
        return NextResponse.json(
          { error: 'DB not migrated', code: 'DB_NOT_MIGRATED', message: 'Database migrations have not been run. Run: prisma migrate deploy' },
          { status: 500 }
        )
      }
    }
    const pgUrl = getPgUrl()
    if (!pgUrl) {
      logDashboardAuth(clerkUserId, userEmail, null, null, null, 503, 'Database not configured')
      return NextResponse.json(
        { error: 'Database not configured. Please set up Postgres.' },
        { status: 503 }
      )
    }

    // Match on users.clerk_user_id === Clerk user.id (exact string match, not email or internal UUID)
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
      console.error('[Dashboard] users table lookup failed:', e.message)
      if (isUsersTableMissing(e)) {
        logDashboardAuth(clerkUserId, userEmail, null, null, null, 500, 'DB not migrated')
        return NextResponse.json(
          { error: 'DB not migrated', code: 'DB_NOT_MIGRATED', message: 'Database migrations have not been run. Run: prisma migrate deploy' },
          { status: 500 }
        )
      }
      logDashboardAuth(clerkUserId, userEmail, null, null, null, 500, 'Users table lookup failed')
      return NextResponse.json(
        { error: 'Failed to resolve user', details: e.message },
        { status: 500 }
      )
    }

    let internalUser = userResult.rows[0] || null
    console.log('[Dashboard] debug internalUser after SELECT:', internalUser ? { ...internalUser } : null)

    if (!internalUser) {
      logDashboardAuth(clerkUserId, userEmail, null, null, null, 403, 'USER_NOT_PROVISIONED')
      return NextResponse.json(
        { error: 'User not provisioned', code: 'USER_NOT_PROVISIONED', reason: 'No internal user row for this Clerk user' },
        { status: 403 }
      )
    }

    // Only 403 if is_active explicitly false (legacy column) or role explicitly disallowed
    if (internalUser.is_active === false) {
      logDashboardAuth(clerkUserId, userEmail, internalUser, internalUser.system_role, null, 403, 'USER_INACTIVE')
      return NextResponse.json(
        { error: 'User inactive', code: 'USER_INACTIVE', reason: 'Account is inactive' },
        { status: 403 }
      )
    }

    const systemRole = (internalUser.system_role || 'user').toLowerCase().trim()
    const jobTitle = String(internalUser.job_title || '').toLowerCase().trim().replace(/[\s-]+/g, '_')
    const clerkAdminUser = await isAdmin()
    if (systemRole !== 'owner' && systemRole !== 'admin' && !ALLOWED_DASHBOARD_JOB_TITLES.includes(jobTitle) && !clerkAdminUser) {
      logDashboardAuth(clerkUserId, userEmail, internalUser, systemRole, null, 403, 'ROLE_NOT_PERMITTED')
      return NextResponse.json(
        {
          error: 'Access denied',
          code: 'ROLE_NOT_PERMITTED',
          reason: jobTitle ? 'Your job title does not have dashboard access.' : 'No job title assigned. Ask an admin to assign your staff job title.',
        },
        { status: 403 }
      )
    }

    // Count estate assignments (for logging only) — table may not exist on Phase 1 DBs
    let assignedEstateCount = 0
    if (await pgPublicTableExists('user_estate_assignments')) {
      const countResult = await sql`SELECT COUNT(*)::int AS c FROM user_estate_assignments WHERE user_id = ${internalUser.id}`
      assignedEstateCount = countResult.rows[0]?.c ?? 0
    }

    console.log('[Dashboard] debug:', { systemRole, jobTitle, is_active: internalUser.is_active, assignedEstateCount })

    const admin = systemRole === 'owner' || systemRole === 'admin' || clerkAdminUser

    // User exists and is allowed: if no estates assigned, still return 200 with empty dashboard (do NOT 403)
    // Temporarily: do not early-return here so we can confirm access works without estate scoping
    const hasEstates = assignedEstateCount > 0
    if (!admin && !hasEstates) {
      logDashboardAuth(clerkUserId, userEmail, internalUser, systemRole, assignedEstateCount, 200, 'ok_no_estates')
      return NextResponse.json({
        stats: { totalCompleted: 0, scheduledCompleted: 0, adHocCompleted: 0 },
        inspections: [],
        message: 'No estates assigned yet.',
      })
    }

    const { searchParams } = new URL(request.url)
    const whereConditions = buildInspectionWhereConditions({
      completionScope: 'completed',
      dateField: 'submitted_at',
      dateFrom: searchParams.get('dateFrom') || '',
      dateTo: searchParams.get('dateTo') || '',
      type: searchParams.get('type') || 'all',
      template: searchParams.get('template') || 'all',
      workType: searchParams.get('workType') || 'all',
      role: searchParams.get('role') || 'all',
      estateId: searchParams.get('estateId') || '',
      blockId: searchParams.get('blockId') || '',
      inspector: searchParams.get('inspector') || 'all',
      scheduled: searchParams.get('scheduled') || 'all',
      grading: searchParams.get('grading') || 'all',
      admin,
      fallbackInspectorId: !TEMPORARILY_DISABLE_ESTATE_SCOPING ? internalUser.email : null,
    })
    const [whereText, whereParams] = joinSqlAnd(whereConditions)
    const run = getNeonQuery()

    // Keep default management reporting focused on scheduled caretaker work, while
    // surfacing ESM and Housing Officer activity as separate operating lines.
    const statsResult = await run(
      `SELECT
        COUNT(*) FILTER (WHERE work_type = 'caretaker_scheduled') AS caretaker_scheduled,
        COUNT(*) FILTER (WHERE work_type = 'caretaker_scheduled' AND status = 'submitted') AS caretaker_completed,
        COUNT(*) FILTER (WHERE work_type = 'caretaker_scheduled' AND status IS DISTINCT FROM 'submitted') AS caretaker_missed,
        COUNT(*) FILTER (WHERE work_type = 'esm_adhoc' AND status = 'submitted') AS esm_adhoc_completed,
        COUNT(DISTINCT estate_id) FILTER (WHERE work_type = 'esm_adhoc' AND status = 'submitted' AND estate_id IS NOT NULL) AS esm_estates_checked,
        COUNT(*) FILTER (WHERE work_type = 'housing_walkabout' AND status = 'submitted') AS housing_walkabouts_completed,
        COUNT(*) FILTER (WHERE status = 'submitted') AS total_completed
      FROM inspections
      WHERE ${whereText}`,
      whereParams
    )

    const lim = whereParams.length + 1
    const dashboardPdfFragments = [
      'pdf_url, full_pdf_url, poster_pdf_url, pdf_generation_error',
      'pdf_url, full_pdf_url, poster_pdf_url',
      'pdf_url, full_pdf_url',
      'pdf_url',
    ]
    const inspectionsRows = await queryInspectionRowsWithPdfColumnFallback(
      run,
      dashboardPdfFragments,
      (pdfCols) =>
        `SELECT
        id, type, work_type, location_label, inspector_name, inspector_id,
        template_id, template_name, due_date, submitted_at, grading,
        ${pdfCols}
      FROM inspections
      WHERE ${whereText}
      ORDER BY submitted_at DESC
      LIMIT $${lim}`,
      [...whereParams, 100]
    )

    const stats = {
      totalCompleted: parseInt(statsResult.rows[0]?.total_completed || 0),
      scheduledCompleted: parseInt(statsResult.rows[0]?.caretaker_completed || 0),
      adHocCompleted: parseInt(statsResult.rows[0]?.esm_adhoc_completed || 0),
      caretakerScheduled: parseInt(statsResult.rows[0]?.caretaker_scheduled || 0),
      caretakerCompleted: parseInt(statsResult.rows[0]?.caretaker_completed || 0),
      caretakerMissed: parseInt(statsResult.rows[0]?.caretaker_missed || 0),
      caretakerCompletionRate:
        parseInt(statsResult.rows[0]?.caretaker_scheduled || 0) > 0
          ? Math.round((parseInt(statsResult.rows[0]?.caretaker_completed || 0) * 100) / parseInt(statsResult.rows[0]?.caretaker_scheduled || 0))
          : null,
      esmAdhocCompleted: parseInt(statsResult.rows[0]?.esm_adhoc_completed || 0),
      esmEstatesChecked: parseInt(statsResult.rows[0]?.esm_estates_checked || 0),
      housingWalkaboutsCompleted: parseInt(statsResult.rows[0]?.housing_walkabouts_completed || 0),
    }

    logDashboardAuth(clerkUserId, userEmail, internalUser, systemRole, assignedEstateCount, 200, 'ok')
    return NextResponse.json({
      stats,
      inspections: inspectionsRows,
    })
  } catch (error) {
    console.error('Error fetching dashboard data:', error)
    return NextResponse.json(
      { error: 'Failed to fetch dashboard data', details: error.message },
      { status: 500 }
    )
  }
}
