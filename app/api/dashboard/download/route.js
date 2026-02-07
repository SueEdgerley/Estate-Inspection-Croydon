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
    const missed = searchParams.get('missed')
    const dataType = searchParams.get('dataType')

    // Questions & Answers export: inspection_answers for completed inspections
    if (dataType === 'questions_answers') {
      const answersResult = await sql`
        SELECT i.id AS inspection_id, i.title, i.submitted_at,
               ia.section_id, ia.question_id, ia.question_type,
               ia.answer_value, ia.answer_text, ia.answer_number, ia.answer_boolean, ia.notes
        FROM inspection_answers ia
        JOIN inspections i ON i.id = ia.inspection_id
        WHERE i.status = 'submitted'
        ORDER BY i.submitted_at DESC, ia.section_id, ia.question_id
      `
      const headers = ['Inspection ID', 'Title', 'Completed', 'Section', 'Question', 'Type', 'Answer', 'Notes']
      const rows = answersResult.rows.map(row => [
        row.inspection_id || '',
        row.title || '',
        row.submitted_at ? new Date(row.submitted_at).toLocaleDateString('en-GB') : '',
        row.section_id || '',
        row.question_id || '',
        row.question_type || '',
        (row.answer_value ?? row.answer_text ?? row.answer_number ?? row.answer_boolean ?? '').toString(),
        row.notes || ''
      ])
      const csv = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell.toString().replace(/"/g, '""')}"`).join(','))
      ].join('\n')
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="questions-answers-${new Date().toISOString().split('T')[0]}.csv"`
        }
      })
    }

    // Build WHERE conditions
    let whereConditions = []
    if (missed === '1') {
      whereConditions.push(sql`is_scheduled = true`)
      whereConditions.push(sql`(status IS DISTINCT FROM 'submitted' OR submitted_at IS NULL)`)
    } else {
      whereConditions.push(sql`status = 'submitted'`)
    }

    if (dateFrom) {
      if (missed === '1') {
        whereConditions.push(sql`due_date >= ${dateFrom}`)
      } else {
        whereConditions.push(sql`submitted_at >= ${dateFrom}`)
      }
    }
    if (dateTo) {
      if (missed === '1') {
        whereConditions.push(sql`due_date <= ${dateTo + ' 23:59:59'}`)
      } else {
        whereConditions.push(sql`submitted_at <= ${dateTo + ' 23:59:59'}`)
      }
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

    const whereClause = whereConditions.length > 0
      ? sql`WHERE ${sql.join(whereConditions, sql` AND `)}`
      : sql``

    const result = await sql`
      SELECT 
        type, location_label, inspector_name, template_name, 
        due_date, submitted_at, grading
      FROM inspections
      ${whereClause}
      ORDER BY submitted_at DESC
    `

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

    const filename = dataType ? `inspections-${dataType}-${new Date().toISOString().split('T')[0]}.csv` : `inspections-${new Date().toISOString().split('T')[0]}.csv`
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${filename}"`
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
