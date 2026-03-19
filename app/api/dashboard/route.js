import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl, isDatabaseCredentialError } from '@/lib/db'
import { getRouteAccess } from '@/lib/permissions'

// Node Postgres client requires Node runtime
export const runtime = "nodejs";
export const dynamic = 'force-dynamic'

function logDashboard(event, payload = {}) {
  console.log(`[Dashboard] ${event}`, payload)
}

export async function GET(request) {
  const { access, denialResponse } = await getRouteAccess({ requireDashboard: true })
  logDashboard('auth_context', {
    clerkUserId: access?.clerkUserId ?? null,
    email: access?.email ?? null,
    airtableMatchedBy: access?.matchedBy ?? null,
    airtableUserId: access?.airtableUser?.id ?? null,
    appRole: access?.appRole ?? null,
    denialCode: access?.denialCode ?? null,
    denialReason: access?.denialReason ?? null,
  })

  if (denialResponse) return denialResponse

  try {
    await ensureDatabase()
    const pgUrl = getPgUrl()
    const neonConnected = !!pgUrl
    logDashboard('neon_connection_status', { connected: neonConnected })
    if (!pgUrl) {
      return NextResponse.json(
        { error: 'Database not configured. Please set up Postgres.' },
        { status: 503 }
      )
    }

    const admin = access.permissions.admin
    const { searchParams } = new URL(request.url)
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')
    const type = searchParams.get('type')
    const template = searchParams.get('template')
    const inspector = searchParams.get('inspector')
    const scheduled = searchParams.get('scheduled')
    const grading = searchParams.get('grading')

    logDashboard('query_start', {
      admin,
      emailFilter: admin ? null : access.email,
      filters: { dateFrom, dateTo, type, template, inspector, scheduled, grading },
    })

    const clauses = [`status = 'submitted'`]
    const params = []

    if (!admin) {
      if (!access.email) {
        return NextResponse.json({
          stats: { totalCompleted: 0, scheduledCompleted: 0, adHocCompleted: 0 },
          inspections: [],
          message: 'No email is linked to your account for dashboard filtering.',
        })
      }
      params.push(access.email)
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

    try {
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

      logDashboard('query_result', {
        stats,
        inspectionCount: inspectionsResult.rows.length,
      })

      return NextResponse.json({
        stats,
        inspections: inspectionsResult.rows,
      })
    } catch (queryError) {
      if (isDatabaseCredentialError(queryError)) {
        console.error('[Dashboard] Database credential failure', {
          message: queryError?.message || String(queryError),
        })
        return NextResponse.json(
          {
            stats: { totalCompleted: 0, scheduledCompleted: 0, adHocCompleted: 0 },
            inspections: [],
            errorCode: 'DB_AUTH_FAILED',
            message:
              'Dashboard database connection failed. Please contact an administrator to update the Postgres credentials.',
          },
          { status: 503 }
        )
      }
      console.error('[Dashboard] Neon query failed', {
        message: queryError?.message || String(queryError),
      })
      return NextResponse.json({
        stats: { totalCompleted: 0, scheduledCompleted: 0, adHocCompleted: 0 },
        inspections: [],
        errorCode: 'NEON_QUERY_FAILED',
        message: 'Dashboard data is temporarily unavailable due to a database query error. Please try again shortly.',
      })
    }
  } catch (error) {
    if (isDatabaseCredentialError(error)) {
      console.error('[Dashboard] Database credential failure (outer)', {
        message: error?.message || String(error),
      })
      return NextResponse.json(
        {
          stats: { totalCompleted: 0, scheduledCompleted: 0, adHocCompleted: 0 },
          inspections: [],
          errorCode: 'DB_AUTH_FAILED',
          message:
            'Dashboard database connection failed. Please contact an administrator to update the Postgres credentials.',
        },
        { status: 503 }
      )
    }
    console.error('[Dashboard] unexpected error', error)
    return NextResponse.json({
      stats: { totalCompleted: 0, scheduledCompleted: 0, adHocCompleted: 0 },
      inspections: [],
      errorCode: 'DASHBOARD_UNEXPECTED_ERROR',
      message: 'Dashboard is temporarily unavailable. Please try again shortly.',
    })
  }
}
