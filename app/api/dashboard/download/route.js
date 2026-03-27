import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl, getNeonQuery } from '@/lib/db'
import { getCurrentUserEmail, isAdmin } from '@/lib/auth'
import { buildInspectionWhereConditions, joinSqlAnd, fragment } from '@/lib/inspection-filters'

// Node Postgres client requires Node runtime
export const runtime = "nodejs";
export const dynamic = 'force-dynamic'

const asArray = (v) => Array.isArray(v) ? v : (v == null ? [] : [v]);

export async function GET(request) {
  try {
    const { userId } = await auth()
    if (!userId) {
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

    const clerkAdmin = await isAdmin()
    let postgresListAll = false
    try {
      const roleRow = await sql`
        SELECT lower(trim(role)) AS r FROM users WHERE clerk_user_id = ${userId} LIMIT 1
      `
      const r = roleRow.rows[0]?.r || ''
      postgresListAll = r === 'owner' || r === 'admin'
    } catch {
      postgresListAll = false
    }
    const admin = clerkAdmin || postgresListAll
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
        taskConditions.push(fragment`a.status = 'completed'`)
      } else if (taskFilter === 'outstanding') {
        taskConditions.push(fragment`(a.status IS DISTINCT FROM 'completed' OR a.status IS NULL)`)
      }
      if (!admin && userEmail) {
        taskConditions.push(fragment`i.inspector_id = ${userEmail}`)
      }
      const [taskWhereText, taskWhereParams] = joinSqlAnd(asArray(taskConditions))
      const actionsResult = await getNeonQuery()(
        `SELECT a.id, a.inspection_id, a.section_name, a.question_id, a.category, a.priority,
               a.title, a.description, a.location, a.status, a.comment, a.auto_created,
               a.created_at, a.updated_at,
               i.title AS inspection_title, i.submitted_at AS inspection_submitted,
               p.name AS recipient_name
        FROM actions a
        LEFT JOIN inspections i ON i.id = a.inspection_id
        LEFT JOIN people p ON p.id = a.recipient_person_id
        WHERE ${taskWhereText}
        ORDER BY a.created_at DESC`,
        taskWhereParams
      )
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
      const csv = asArray([
        asArray(headers).join(','),
        ...rows.map(row => asArray(row.map(cell => `"${String(cell).replace(/"/g, '""')}"`)).join(','))
      ]).join('\n')
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
      const qaConditions = [fragment`i.status = 'submitted'`]
      if (!admin && userEmail) qaConditions.push(fragment`i.inspector_id = ${userEmail}`)
      const [qaWhereText, qaWhereParams] = joinSqlAnd(asArray(qaConditions))
      const answersResult = await getNeonQuery()(
        `SELECT i.id AS inspection_id, i.title, i.submitted_at,
               ia.section_id, ia.question_id, ia.question_type,
               ia.answer_value, ia.answer_text, ia.answer_number, ia.answer_boolean, ia.notes
        FROM inspection_answers ia
        JOIN inspections i ON i.id = ia.inspection_id
        WHERE ${qaWhereText}
        ORDER BY i.submitted_at DESC, ia.section_id, ia.question_id`,
        qaWhereParams
      )
      const headers = ['Inspection ID', 'Title', 'Completed', 'Section', 'Question', 'Type', 'Answer', 'Notes']
      const rows = answersResult.rows.map(row => [
        row.inspection_id || '',
        row.title || '',
        row.submitted_at ? new Date(row.submitted_at).toLocaleDateString('en-GB') : '',
        row.section_id || '',
        row.question_id || '',
        asArray(row.question_type).join(','),
        (row.answer_value ?? row.answer_text ?? row.answer_number ?? row.answer_boolean ?? '').toString(),
        row.notes || ''
      ])
      const csv = asArray([
        asArray(headers).join(','),
        ...rows.map(row => asArray(row.map(cell => `"${String(cell).replace(/"/g, '""')}"`)).join(','))
      ]).join('\n')
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="questions-answers-${new Date().toISOString().split('T')[0]}.csv"`
        }
      })
    }

    // Build WHERE conditions (shared with dashboard + inspections list)
    const whereConditions = buildInspectionWhereConditions({
      completionScope: missed === '1' ? 'active' : 'completed',
      dateField: missed === '1' ? 'due_date' : 'submitted_at',
      dateFrom: dateFrom || '',
      dateTo: dateTo || '',
      type: type || 'all',
      template: template || 'all',
      inspector: inspector || 'all',
      scheduled: missed === '1' ? 'scheduled' : (scheduled || 'all'),
      grading: grading || 'all',
      admin,
      fallbackInspectorId: userEmail || null,
    })

    const [whereText, whereParams] = joinSqlAnd(asArray(whereConditions))

    const result = await getNeonQuery()(
      `SELECT 
        type, location_label, inspector_name, template_name, 
        due_date, submitted_at, grading
      FROM inspections
      WHERE ${whereText}
      ORDER BY submitted_at DESC`,
      whereParams
    )

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

    const csv = asArray([
      asArray(headers).join(','),
      ...rows.map(row => asArray(row.map(cell => `"${String(cell).replace(/"/g, '""')}"`)).join(','))
    ]).join('\n')

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
