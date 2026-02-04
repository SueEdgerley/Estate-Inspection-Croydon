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

    if (dateFrom) {
      whereConditions.push(sql`submitted_at >= ${dateFrom}`)
    }
    if (dateTo) {
      whereConditions.push(sql`submitted_at <= ${dateTo + ' 23:59:59'}`)
    }
    if (type && type !== 'all') {
      whereConditions.push(sql`type = ${type}`)
    }
    if (template && template !== 'all') {
      whereConditions.push(sql`template_id = ${template}`)
    }
    if (inspector && inspector !== 'all') {
      whereConditions.push(sql`inspector_id = ${inspector}`)
    }
    if (scheduled && scheduled !== 'all') {
      if (scheduled === 'scheduled') {
        whereConditions.push(sql`is_scheduled = true`)
      } else {
        whereConditions.push(sql`(is_scheduled = false OR is_scheduled IS NULL)`)
      }
    }
    if (grading && grading !== 'all') {
      whereConditions.push(sql`grading = ${grading}`)
    }

    // Combine conditions
    const whereClause = whereConditions.length > 0 
      ? sql`WHERE ${sql.join(whereConditions, sql` AND `)}`
      : sql``

    // Get inspections for CSV
    const result = await sql`
      SELECT 
        type, location_label, inspector_name, template_name, 
        due_date, submitted_at, grading
      FROM inspections
      ${whereClause}
      ORDER BY submitted_at DESC
    `

    // Generate CSV
    const headers = ['Type', 'Location', 'User', 'Template', 'Due Date', 'Completed', 'Grading']
    const rows = result.rows.map(row => [
      row.type || '',
      row.location_label || '',
      row.inspector_name || '',
      row.template_name || '',
      row.due_date ? new Date(row.due_date).toLocaleDateString('en-GB') : '',
      row.submitted_at ? new Date(row.submitted_at).toLocaleDateString('en-GB') : '',
      row.grading || ''
    ])

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell.toString().replace(/"/g, '""')}"`).join(','))
    ].join('\n')

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="inspections-${new Date().toISOString().split('T')[0]}.csv"`
      }
    })
  } catch (error) {
    console.error('Error generating CSV:', error)
    return NextResponse.json(
      { error: 'Failed to generate CSV', details: error.message },
      { status: 500 }
    )
  }
}
