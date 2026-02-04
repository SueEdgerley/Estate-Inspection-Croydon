import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
  try {
    await ensureDatabase()
    
    if (!process.env.POSTGRES_URL) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 503 }
      )
    }

    const { searchParams } = new URL(request.url)
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')
    const type = searchParams.get('type')
    const template = searchParams.get('template')
    const inspector = searchParams.get('inspector')
    const scheduled = searchParams.get('scheduled')
    const grading = searchParams.get('grading')

    // Build WHERE conditions using template literals
    let whereConditions = [sql`status = 'submitted'`]
    let conditions = []

    if (dateFrom) {
      whereConditions.push(sql`submitted_at >= ${dateFrom}`)
      conditions.push(`submitted_at >= '${dateFrom}'`)
    }
    if (dateTo) {
      whereConditions.push(sql`submitted_at <= ${dateTo + ' 23:59:59'}`)
      conditions.push(`submitted_at <= '${dateTo} 23:59:59'`)
    }
    if (type && type !== 'all') {
      whereConditions.push(sql`type = ${type}`)
      conditions.push(`type = '${type}'`)
    }
    if (template && template !== 'all') {
      whereConditions.push(sql`template_id = ${template}`)
      conditions.push(`template_id = '${template}'`)
    }
    if (inspector && inspector !== 'all') {
      whereConditions.push(sql`inspector_id = ${inspector}`)
      conditions.push(`inspector_id = '${inspector}'`)
    }
    if (scheduled && scheduled !== 'all') {
      if (scheduled === 'scheduled') {
        whereConditions.push(sql`is_scheduled = true`)
        conditions.push(`is_scheduled = true`)
      } else {
        whereConditions.push(sql`(is_scheduled = false OR is_scheduled IS NULL)`)
        conditions.push(`(is_scheduled = false OR is_scheduled IS NULL)`)
      }
    }
    if (grading && grading !== 'all') {
      whereConditions.push(sql`grading = ${grading}`)
      conditions.push(`grading = '${grading}'`)
    }

    // Combine conditions
    const whereClause = whereConditions.length > 0 
      ? sql`WHERE ${sql.join(whereConditions, sql` AND `)}`
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
