import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '@/lib/db'
import { getCurrentUserEmail } from '@/lib/auth'

const ALLOWED_DASHBOARD_ROLES = ['owner', 'admin', 'user', 'caretaker', 'esm', 'ho']
// Set to true to show all inspections regardless of inspector/estate (for debugging access)
const TEMPORARILY_DISABLE_ESTATE_SCOPING = true

// Node Postgres client requires Node runtime
export const runtime = "nodejs";
export const dynamic = 'force-dynamic'

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
    const pgUrl = getPgUrl()
    if (!pgUrl) {
      logDashboardAuth(clerkUserId, userEmail, null, null, null, 503, 'Database not configured')
      return NextResponse.json(
        { error: 'Database not configured. Please set up Postgres.' },
        { status: 503 }
      )
    }

    // Detect missing table so we return a clear 500 "DB not migrated" (not "unauthorised")
    function isUsersTableMissing(err) {
      if (!err) return false
      const code = err.code
      const msg = (err.message || '').toLowerCase()
      return code === '42P01' || msg.includes('does not exist') || msg.includes('relation "users"')
    }

    // Match on users.clerk_user_id === Clerk user.id (exact string match, not email or internal UUID)
    let userResult
    try {
      userResult = await sql`SELECT id, clerk_user_id, email, role, is_active FROM users WHERE clerk_user_id = ${clerkUserId} LIMIT 1`
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

    // If no internal user row: create one. First user gets role = "owner", all others role = "user".
    if (!internalUser) {
      try {
        const countResult = await sql`SELECT COUNT(*)::int AS c FROM users`
        const userCount = countResult.rows[0]?.c ?? 0
        const newRole = userCount === 0 ? 'owner' : 'user'
        const newId = crypto.randomUUID()
        await sql`
          INSERT INTO users (id, clerk_user_id, email, role, is_active)
          VALUES (${newId}, ${clerkUserId}, ${userEmail || ''}, ${newRole}, true)
          ON CONFLICT (clerk_user_id) DO UPDATE SET
            email = EXCLUDED.email,
            role = COALESCE(users.role, EXCLUDED.role),
            is_active = COALESCE(users.is_active, true)
        `
        const refetch = await sql`SELECT id, clerk_user_id, email, role, is_active FROM users WHERE clerk_user_id = ${clerkUserId} LIMIT 1`
        internalUser = refetch.rows[0] || null
        console.log('[Dashboard] debug internalUser after auto-create:', internalUser ? { ...internalUser } : null)
      } catch (e) {
        console.warn('[Dashboard] Auto-create user row failed:', e.message)
        if (isUsersTableMissing(e)) {
          logDashboardAuth(clerkUserId, userEmail, null, null, null, 500, 'DB not migrated')
          return NextResponse.json(
            { error: 'DB not migrated', code: 'DB_NOT_MIGRATED', message: 'Database migrations have not been run. Run: prisma migrate deploy' },
            { status: 500 }
          )
        }
      }
    }

    if (!internalUser) {
      logDashboardAuth(clerkUserId, userEmail, null, null, null, 403, 'USER_NOT_PROVISIONED')
      return NextResponse.json(
        { error: 'User not provisioned', code: 'USER_NOT_PROVISIONED', reason: 'No internal user row for this Clerk user' },
        { status: 403 }
      )
    }

    // Only 403 if is_active = false or role explicitly disallowed
    if (!internalUser.is_active) {
      logDashboardAuth(clerkUserId, userEmail, internalUser, internalUser.role, null, 403, 'USER_INACTIVE')
      return NextResponse.json(
        { error: 'User inactive', code: 'USER_INACTIVE', reason: 'Account is inactive' },
        { status: 403 }
      )
    }

    const role = (internalUser.role || '').toLowerCase().trim()
    if (role && !ALLOWED_DASHBOARD_ROLES.includes(role)) {
      logDashboardAuth(clerkUserId, userEmail, internalUser, internalUser.role, null, 403, 'ROLE_NOT_PERMITTED')
      return NextResponse.json(
        { error: 'Role not permitted', code: 'ROLE_NOT_PERMITTED', reason: 'Role not allowed for dashboard' },
        { status: 403 }
      )
    }

    // Count estate assignments (for logging only; we do NOT 403 when 0)
    let assignedEstateCount = 0
    try {
      const countResult = await sql`SELECT COUNT(*)::int AS c FROM user_estate_assignments WHERE user_id = ${internalUser.id}`
      assignedEstateCount = countResult.rows[0]?.c ?? 0
    } catch {
      // Table might not exist yet
    }

    console.log('[Dashboard] debug:', { role, is_active: internalUser.is_active, assignedEstateCount })

    const admin = role === 'admin' || role === 'owner'

    // User exists and is allowed: if no estates assigned, still return 200 with empty dashboard (do NOT 403)
    // Temporarily: do not early-return here so we can confirm access works without estate scoping
    const hasEstates = assignedEstateCount > 0
    if (!admin && !hasEstates) {
      logDashboardAuth(clerkUserId, userEmail, internalUser, internalUser.role, assignedEstateCount, 200, 'ok_no_estates')
      return NextResponse.json({
        stats: { totalCompleted: 0, scheduledCompleted: 0, adHocCompleted: 0 },
        inspections: [],
        message: 'No estates assigned yet.',
      })
    }

    const { searchParams } = new URL(request.url)
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')
    const type = searchParams.get('type')
    const template = searchParams.get('template')
    const inspector = searchParams.get('inspector')
    const scheduled = searchParams.get('scheduled')
    const grading = searchParams.get('grading')

    // Build WHERE clause as plain SQL + params (avoids sql`` fragment placeholder bugs)
    const clauses = [`status = 'submitted'`]
    const params = []

    if (!admin && internalUser.email && !TEMPORARILY_DISABLE_ESTATE_SCOPING) {
      params.push(internalUser.email)
      clauses.push(`inspector_id = $${params.length}`)
    }

    if (dateFrom) {
      params.push(dateFrom)
      clauses.push(`submitted_at >= $${params.length}`)
    }

    if (dateTo) {
      params.push(dateTo + ' 23:59:59')
      clauses.push(`submitted_at <= $${params.length}`)
    }

    if (type && type !== 'all') {
      params.push(type)
      clauses.push(`type = $${params.length}`)
    }

    if (template && template !== 'all') {
      params.push(template)
      clauses.push(`template_id = $${params.length}`)
    }

    if (admin && inspector && inspector !== 'all') {
      params.push(inspector)
      clauses.push(`inspector_id = $${params.length}`)
    }

    if (scheduled && scheduled !== 'all') {
      if (scheduled === 'scheduled') {
        clauses.push(`is_scheduled = true`)
      } else {
        clauses.push(`(is_scheduled = false OR is_scheduled IS NULL)`)
      }
    }

    if (grading && grading !== 'all') {
      params.push(grading)
      clauses.push(`grading = $${params.length}`)
    }

    const whereSql = `WHERE ${clauses.join(' AND ')}`

    // Stats query
    const statsResult = await sql.query(
      `
  SELECT 
    COUNT(*) FILTER (WHERE status = 'submitted') as total_completed,
    COUNT(*) FILTER (WHERE status = 'submitted' AND is_scheduled = true) as scheduled_completed,
    COUNT(*) FILTER (WHERE status = 'submitted' AND (is_scheduled = false OR is_scheduled IS NULL)) as ad_hoc_completed
  FROM inspections
  ${whereSql}
  `,
      params
    )

    // Inspections query
    const inspectionsResult = await sql.query(
      `
  SELECT 
    id, type, location_label, inspector_name, inspector_id,
    template_id, template_name, due_date, submitted_at, grading, pdf_url
  FROM inspections
  ${whereSql}
  ORDER BY submitted_at DESC
  LIMIT 100
  `,
      params
    )

    const stats = {
      totalCompleted: parseInt(statsResult.rows[0]?.total_completed || 0),
      scheduledCompleted: parseInt(statsResult.rows[0]?.scheduled_completed || 0),
      adHocCompleted: parseInt(statsResult.rows[0]?.ad_hoc_completed || 0),
    }

    logDashboardAuth(clerkUserId, userEmail, internalUser, internalUser.role, assignedEstateCount, 200, 'ok')
    return NextResponse.json({
      stats,
      inspections: inspectionsResult.rows,
    })
  } catch (error) {
    console.error('Error fetching dashboard data:', error)
    return NextResponse.json(
      { error: 'Failed to fetch dashboard data', details: error.message },
      { status: 500 }
    )
  }
}
