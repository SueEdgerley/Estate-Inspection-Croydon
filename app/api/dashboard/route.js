import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '@/lib/db'
import { getCurrentUserEmail } from '@/lib/auth'

const ALLOWED_DASHBOARD_ROLES = ['admin', 'caretaker', 'esm', 'ho']

// Node Postgres client requires Node runtime
export const runtime = "nodejs";
export const dynamic = 'force-dynamic'

function logDashboardAuth(clerkUserId, email, internalUserId, role, assignedEstateCount, statusCode) {
  console.log('[Dashboard] auth:', {
    clerkUserId: clerkUserId ?? null,
    email: email ?? null,
    internalUserId: internalUserId ?? null,
    role: role ?? null,
    assignedEstateCount: assignedEstateCount ?? null,
    statusCode,
  })
}

export async function GET(request) {
  const { userId: clerkUserId } = await auth()
  const userEmail = await getCurrentUserEmail()

  try {
    if (!clerkUserId) {
      logDashboardAuth(clerkUserId, userEmail, null, null, null, 401)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await ensureDatabase()
    const pgUrl = getPgUrl()
    if (!pgUrl) {
      logDashboardAuth(clerkUserId, userEmail, null, null, null, 503)
      return NextResponse.json(
        { error: 'Database not configured. Please set up Postgres.' },
        { status: 503 }
      )
    }

    // Resolve Clerk user to internal user (users table)
    let userResult
    try {
      userResult = await sql`SELECT id, clerk_user_id, email, role, is_active FROM users WHERE clerk_user_id = ${clerkUserId} LIMIT 1`
    } catch (e) {
      console.error('[Dashboard] users table lookup failed:', e.message)
      logDashboardAuth(clerkUserId, userEmail, null, null, null, 500)
      return NextResponse.json(
        { error: 'Failed to resolve user', details: e.message },
        { status: 500 }
      )
    }

    let internalUser = userResult.rows[0] || null

    // Optional: create internal user row on first sign-in so admin can assign role/estates (still return 403 until they do)
    if (!internalUser) {
      try {
        const newId = crypto.randomUUID()
        await sql`
          INSERT INTO users (id, clerk_user_id, email, role, is_active)
          VALUES (${newId}, ${clerkUserId}, ${userEmail || ''}, null, false)
          ON CONFLICT (clerk_user_id) DO UPDATE SET email = EXCLUDED.email
        `
      } catch (e) {
        console.warn('[Dashboard] Auto-create user row failed:', e.message)
      }
    }

    if (!internalUser) {
      logDashboardAuth(clerkUserId, userEmail, null, null, null, 403)
      return NextResponse.json(
        { error: 'User not provisioned', code: 'USER_NOT_PROVISIONED' },
        { status: 403 }
      )
    }

    if (!internalUser.is_active) {
      logDashboardAuth(clerkUserId, userEmail, internalUser.id, internalUser.role, null, 403)
      return NextResponse.json(
        { error: 'User inactive', code: 'USER_INACTIVE' },
        { status: 403 }
      )
    }

    const role = (internalUser.role || '').toLowerCase().trim()
    if (role && !ALLOWED_DASHBOARD_ROLES.includes(role)) {
      logDashboardAuth(clerkUserId, userEmail, internalUser.id, internalUser.role, null, 403)
      return NextResponse.json(
        { error: 'Role not permitted', code: 'ROLE_NOT_PERMITTED' },
        { status: 403 }
      )
    }

    // Count estate assignments for this user
    let assignedEstateCount = 0
    try {
      const countResult = await sql`SELECT COUNT(*)::int AS c FROM user_estate_assignments WHERE user_id = ${internalUser.id}`
      assignedEstateCount = countResult.rows[0]?.c ?? 0
    } catch {
      // Table might not exist yet
    }

    const admin = role === 'admin'

    // Signed in and provisioned but no estates assigned → 200 with empty data and message (not 403)
    if (!admin && assignedEstateCount === 0) {
      logDashboardAuth(clerkUserId, userEmail, internalUser.id, internalUser.role, assignedEstateCount, 200)
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

    if (!admin && internalUser.email) {
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

    logDashboardAuth(clerkUserId, userEmail, internalUser.id, internalUser.role, assignedEstateCount, 200)
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
