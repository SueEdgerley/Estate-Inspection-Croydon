import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '@/lib/db'
import { extractCaretakerRecipients, findRecipientQuestion } from '@/lib/caretaker-template'
import { generatePDF } from '@/lib/pdf-generator'
import { sendEmails } from '@/lib/email-sender'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST - Submit inspection (generate PDF and send emails)
export async function POST(request, { params }) {
  try {
    await ensureDatabase()
    const pgUrl = getPgUrl()
    if (!pgUrl) {
      return NextResponse.json(
        { error: 'Database not configured. Please set up Postgres.' },
        { status: 503 }
      )
    }
    const { id } = await params

    // Get inspection
    const inspectionResult = await sql`
      SELECT * FROM inspections WHERE id = ${id}
    `
    
    if (inspectionResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Inspection not found' },
        { status: 404 }
      )
    }
    
    const inspection = inspectionResult.rows[0]

    // Get all answers
    const answersResult = await sql`
      SELECT * FROM inspection_answers WHERE inspection_id = ${id}
      ORDER BY section_id, question_id
    `
    
    const answers = {}
    answersResult.rows.forEach(row => {
      answers[row.question_id] = row.answer_value || row.answer_text || (row.answer_boolean != null ? (row.answer_boolean ? 'Yes' : 'No') : row.answer_number)
    })

    // If draft, create actions (and optionally tasks/emails) from answers so PDF and emails have data
    if (inspection.status === 'draft') {
      const version = inspection.template_version
      const sections = (version && version.sections) || []
      for (const sec of sections) {
        for (const q of sec.questions || []) {
          const val = answers[q.id]
          const normalized = val != null ? String(val).toLowerCase().trim() : ''
          const isNo = normalized === 'no'
          const answerRow = answersResult.rows.find((r) => r.question_id === q.id)
          const comment = (answerRow && answerRow.notes) || ''
          const category = q.action_category || q.category || 'Follow-up'
          const residentMessage = comment || q.question_text || 'Issue raised from inspection'
          if (isNo && q.create_action_on_no !== false) {
            const actionId = `action_${id}_${q.id}_${Date.now()}`
            await sql`
              INSERT INTO actions (
                id, inspection_id, section_id, section_name, question_id,
                category, priority, title, description, location, status,
                comment, auto_created, photo_urls
              )
              VALUES (
                ${actionId}, ${id}, ${sec.id}, ${sec.title || sec.name}, ${q.id},
                ${category}, null, ${residentMessage}, ${residentMessage}, null, 'open',
                ${comment || null}, true, '[]'::jsonb
              )
            `
          }
        }
      }
    }

    // Get all actions (for PDF poster and emails)
    const allActionsResult = await sql`
      SELECT 
        a.*,
        p.email as recipient_email,
        p.name as recipient_name
      FROM actions a
      LEFT JOIN people p ON a.recipient_person_id = p.id
      WHERE a.inspection_id = ${id} AND a.status = 'open'
      ORDER BY a.category, a.created_at
    `
    const allActions = allActionsResult.rows

    // Generate Estate Walkabout Poster PDF (uses actions with photo_urls)
    const pdfUrl = await generatePDF(inspection, answersResult.rows, allActions)

    // Update inspection with PDF URL
    await sql`
      UPDATE inspections 
      SET pdf_url = ${pdfUrl}, 
          status = 'submitted',
          submitted_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
    `

    // Extract recipients from persisted template snapshot (no live Airtable dependency)
    let recipients = []
    const version = inspection.template_version
    const versionSections = (version && version.sections) || []
    const allQuestions = versionSections.flatMap((sec) => sec.questions || [])
    if (allQuestions.length > 0) {
      recipients = extractCaretakerRecipients(answers, allQuestions)
      if (recipients.length === 0) {
        const recipientQuestion = findRecipientQuestion(allQuestions)
        if (recipientQuestion && answers[recipientQuestion.id]) {
          recipients = [answers[recipientQuestion.id]]
        }
      }
    }
    
    // Get actions grouped by category
    const actionsResult = await sql`
      SELECT 
        category, 
        COUNT(*) as count,
        STRING_AGG(DISTINCT section_name || ' – ' || title, '; ') as action_list
      FROM actions 
      WHERE inspection_id = ${id} AND status = 'open'
      GROUP BY category
    `
    
    const actionCategories = actionsResult.rows.map(row => row.category)

    // Send emails
    const emailResults = await sendEmails({
      inspection,
      recipients,
      actionCategories: actionsResult.rows,
      allActions,
      pdfUrl
    })

    // Save recipient records
    for (const recipient of emailResults.sent) {
      await sql`
        INSERT INTO inspection_recipients (
          id, inspection_id, person_id, person_email, recipient_type, sent_at
        ) VALUES (
          ${`recipient_${id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`},
          ${id},
          ${recipient.person_id || null},
          ${recipient.email},
          ${recipient.type || 'targeted'},
          CURRENT_TIMESTAMP
        )
      `
    }

    return NextResponse.json({ inspectionId: id }, { status: 201 })
  } catch (error) {
    console.error('Error submitting inspection:', error)
    return NextResponse.json(
      { error: 'Failed to submit inspection', details: error.message },
      { status: 500 }
    )
  }
}
