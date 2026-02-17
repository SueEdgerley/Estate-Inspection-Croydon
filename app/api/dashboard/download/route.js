import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase } from '@/lib/db'
import { getAuth, getCurrentUserEmail, isAdmin } from '@/lib/auth'

// Node Postgres client requires Node runtime
export const runtime = "nodejs";
export const dynamic = 'force-dynamic'

function asArray(v) {
  if (Array.isArray(v)) return v
  if (v == null) return []
  return [v]
}

function safeJoin(v, sep = ', ') {
  const arr = asArray(v).map((x) => (typeof x === 'string' ? x : x?.name ?? String(x)))
  return arr.join(sep)
}

export async function GET(request) {
  try {
    const { userId } = await getAuth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await ensureDatabase()
    
    if (!process.env.POSTGRES_URL) {
      return NextResponse.json(
        { error: 'Database not configured' },
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
    const missed = searchParams.get('missed')
    const dataType = searchParams.get('dataType')
    const tab = searchParams.get('tab')
    const taskType = searchParams.get('taskType')

    // Tasks export: actions filtered by taskType (raised | completed | outstanding)
    if (tab === 'tasks' || taskType) {
      const taskFilter = taskType || 'raised'
      const taskConditions = []
      if (taskFilter === 'completed') {
        taskConditions.push(sql`a.status = 'completed'`)
      } else if (taskFilter === 'outstanding') {
        taskConditions.push(sql`(a.status IS DISTINCT FROM 'completed' OR a.status IS NULL)`)
      }
      if (!admin && userEmail) {
        taskConditions.push(sql`i.inspector_id = ${userEmail}`)
      }
      const taskWhere = taskConditions.length > 0 ? sql`WHERE ${sql.join(asArray(taskConditions), sql` AND `)}` : sql``
      const actionsResult = await sql`
        SELECT a.id, a.inspection_id, a.section_name, a.question_id, a.category, a.priority,
               a.title, a.description, a.location, a.status, a.comment, a.auto_created,
               a.created_at, a.updated_at,
               i.title AS inspection_title, i.submitted_at AS inspection_submitted,
               p.name AS recipient_name
        FROM actions a
        LEFT JOIN inspections i ON i.id = a.inspection_id
        LEFT JOIN people p ON p.id = a.recipient_person_id
        ${taskWhere}
        ORDER BY a.created_at DESC
      `
      const headers = ['Task ID', 'Inspection ID', 'Inspection', 'Completed', 'Section', 'Category', 'Priority', 'Title', 'Description', 'Location', 'Status', 'Recipient', 'Raised', 'Updated']
      const rows = actionsResult.rows.map(row => [
        row.id || '',
        row.inspection_id || '',
        row.inspection_title || '',
        row.inspection_submitted ? new Date(row.inspection_submitted).toLocaleDateString('en-GB') : '',
        row.section_name || '',
        row.category || '',
        row.priority || '',
        row.title || '',
        (row.description || '').replace(/\s+/g, ' ').trim(),
        row.location || '',
        row.status || '',
        row.recipient_name || '',
        row.created_at ? new Date(row.created_at).toLocaleDateString('en-GB') : '',
        row.updated_at ? new Date(row.updated_at).toLocaleDateString('en-GB') : ''
      ])
      const csv = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell.toString().replace(/"/g, '""')}"`).join(','))
      ].join('\n')
      const filename = `tasks-${taskFilter}-${new Date().toISOString().split('T')[0]}.csv`
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="${filename}"`
        }
      })
    }

    // Questions & Answers export: inspection_answers for completed inspections
    if (dataType === 'questions_answers') {
      const qaConditions = [sql`i.status = 'submitted'`]
      if (!admin && userEmail) qaConditions.push(sql`i.inspector_id = ${userEmail}`)
      const qaWhere = sql`WHERE ${sql.join(asArray(qaConditions), sql` AND `)}`
      const answersResult = await sql`
        SELECT i.id AS inspection_id, i.title, i.submitted_at,
               ia.section_id, ia.question_id, ia.question_type,
               ia.answer_value, ia.answer_text, ia.answer_number, ia.answer_boolean, ia.notes
        FROM inspection_answers ia
        JOIN inspections i ON i.id = ia.inspection_id
        ${qaWhere}
        ORDER BY i.submitted_at DESC, ia.section_id, ia.question_id
      `
      const headers = ['Inspection ID', 'Title', 'Completed', 'Section', 'Question', 'Type', 'Answer', 'Notes']
      const rows = answersResult.rows.map(row => [
        row.inspection_id || '',
        row.title || '',
        row.submitted_at ? new Date(row.submitted_at).toLocaleDateString('en-GB') : '',
        row.section_id || '',
        row.question_id || '',
        safeJoin(row.question_type),
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
    if (!admin && userEmail) {
      whereConditions.push(sql`inspector_id = ${userEmail}`)
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
    if (admin && inspector && inspector !== 'all') {
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
      ? sql`WHERE ${sql.join(asArray(whereConditions), sql` AND `)}`
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
