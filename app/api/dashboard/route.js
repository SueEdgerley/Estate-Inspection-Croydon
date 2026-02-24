import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase } from '@/lib/db'
import { getAuth, getCurrentUserEmail, isAdmin } from '@/lib/auth'

// Node Postgres client requires Node runtime
export const runtime = "nodejs";
export const dynamic = 'force-dynamic'

const asArray = (v) => Array.isArray(v) ? v : (v == null ? [] : [v]);

export async function GET(request) {
  try {
    const { userId } = await getAuth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await ensureDatabase()
    
    if (!process.env.POSTGRES_URL) {
      return NextResponse.json(
        {
          error: 'Database not configured',
          hint: 'Set one of POSTGRES_URL, DATABASE_URL, POSTGRES_PRISMA_URL, or DIRECT_URL in Vercel → Environment Variables. Value must match Neon (same host). See CONNECTION_AND_DASHBOARD_CHECK.md.',
          envVarsUrl: 'https://vercel.com/photobook-73dad537/estate-inspection-croydon/settings/environment-variables',
        },
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

    // Build WHERE conditions using template literals (keep as arrays so .join never throws)
    const whereConditions = [sql`status = 'submitted'`]

    // Non-admins only see their own inspections (by email)
    if (!admin && userEmail) {
      whereConditions.push(sql`inspector_id = ${userEmail}`)
    }

    if (dateFrom) whereConditions.push(sql`submitted_at >= ${dateFrom}`)
    if (dateTo) whereConditions.push(sql`submitted_at <= ${dateTo + ' 23:59:59'}`)
    if (type && type !== 'all') whereConditions.push(sql`type = ${type}`)
    if (template && template !== 'all') whereConditions.push(sql`template_id = ${template}`)
    if (admin && inspector && inspector !== 'all') whereConditions.push(sql`inspector_id = ${inspector}`)
    if (scheduled && scheduled !== 'all') {
      if (scheduled === 'scheduled') {
        whereConditions.push(sql`is_scheduled = true`)
      } else {
        whereConditions.push(sql`(is_scheduled = false OR is_scheduled IS NULL)`)
      }
    }
    if (grading && grading !== 'all') whereConditions.push(sql`grading = ${grading}`)

    const whereClause = whereConditions.length > 0
      ? sql`WHERE ${sql.join(asArray(whereConditions), sql` AND `)}`
      : sql``

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
