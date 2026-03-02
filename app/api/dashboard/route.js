import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '@/lib/db'
import { getCurrentUserEmail, isAdmin } from '@/lib/auth'

// Node Postgres client requires Node runtime
export const runtime = "nodejs";
export const dynamic = 'force-dynamic'

export async function GET(request) {
  try {
    const { userId } = auth()
    const allowUnauthed = process.env.ALLOW_DASHBOARD_UNAUTH === 'true'
    if (!allowUnauthed && !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await ensureDatabase()
    const pgUrl = getPgUrl()
    if (!pgUrl) {
      return NextResponse.json(
        { error: 'Database not configured. Please set up Postgres.' },
        { status: 503 }
      )
    }

    const admin = await isAdmin()
    const userEmail = await getCurrentUserEmail()

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

    if (!admin && userEmail) {
      params.push(userEmail)
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
