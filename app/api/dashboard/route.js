import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '@/lib/db'
import { getCurrentUserEmail, isAdmin } from '@/lib/auth'

// Node Postgres client requires Node runtime
export const runtime = "nodejs";
export const dynamic = 'force-dynamic'

const asArray = (v) => Array.isArray(v) ? v : (v == null ? [] : [v]);

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

    const conditions = [sql`status = 'submitted'`]

    if (!admin && userEmail) conditions.push(sql`inspector_id = ${userEmail}`)
    if (dateFrom) conditions.push(sql`submitted_at >= ${dateFrom}`)
    if (dateTo) conditions.push(sql`submitted_at <= ${dateTo + ' 23:59:59'}`)
    if (type && type !== 'all') conditions.push(sql`type = ${type}`)
    if (template && template !== 'all') conditions.push(sql`template_id = ${template}`)
    if (admin && inspector && inspector !== 'all') conditions.push(sql`inspector_id = ${inspector}`)
    if (scheduled && scheduled !== 'all') {
      conditions.push(
        scheduled === 'scheduled'
          ? sql`is_scheduled = true`
          : sql`(is_scheduled = false OR is_scheduled IS NULL)`
      )
    }
    if (grading && grading !== 'all') conditions.push(sql`grading = ${grading}`)

    let where = null
    for (const cond of conditions) {
      where = where ? sql`${where} AND ${cond}` : cond
    }
    const whereClause = where ? sql`WHERE ${where}` : sql``

    // Get stats
    const statsResult = await sql`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'submitted') as total_completed,
        COUNT(*) FILTER (WHERE status = 'submitted' AND is_scheduled = true) as scheduled_completed,
        COUNT(*) FILTER (WHERE status = 'submitted' AND (is_scheduled = false OR is_scheduled IS NULL)) as ad_hoc_completed
      FROM inspections
      ${whereClause}
    `

    // Get inspections (recent submitted by default)
    const inspectionsResult = await sql`
      SELECT 
        id, type, location_label, inspector_name, inspector_id,
        template_id, template_name, due_date, submitted_at, grading, pdf_url
      FROM inspections
      ${whereClause}
      ORDER BY submitted_at DESC
      LIMIT 100
    `

    const stats = {
      totalCompleted: parseInt(statsResult.rows[0]?.total_completed || 0),
      scheduledCompleted: parseInt(statsResult.rows[0]?.scheduled_completed || 0),
      adHocCompleted: parseInt(statsResult.rows[0]?.ad_hoc_completed || 0)
    }

    return NextResponse.json({
      stats,
      inspections: inspectionsResult.rows
    })
  } catch (error) {
    console.error('Error fetching dashboard data:', error)
    return NextResponse.json(
      { error: 'Failed to fetch dashboard data', details: error.message },
      { status: 500 }
    )
  }
}
