import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase } from '@/lib/db'
import { extractCaretakerRecipients, findRecipientQuestion } from '@/lib/caretaker-template'
import { getTemplateQuestions, normalizeQuestion } from '@/lib/airtable-client'
import { generatePDF } from '@/lib/pdf-generator'
import { sendEmails } from '@/lib/email-sender'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST - Submit inspection (generate PDF and send emails)
export async function POST(request, { params }) {
  try {
    await ensureDatabase()
    
    if (!process.env.POSTGRES_URL) {
      return NextResponse.json(
        { error: 'Database not configured' },
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
      answers[row.question_id] = row.answer_value || row.answer_text || row.answer_boolean || row.answer_number
    })

    // Generate PDF with conditional sections
    const pdfUrl = await generatePDF(inspection, answersResult.rows)

    // Update inspection with PDF URL
    await sql`
      UPDATE inspections 
      SET pdf_url = ${pdfUrl}, 
          status = 'submitted',
          submitted_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
    `

    // Get template questions to extract recipients
    let recipients = []
    if (inspection.template_id) {
      const templateQuestions = await getTemplateQuestions(inspection.template_id)
      const normalizedQuestions = templateQuestions.map(normalizeQuestion)
      recipients = extractCaretakerRecipients(answers, normalizedQuestions)
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
    
    // Get all actions with details for email
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
    
    const actionCategories = actionsResult.rows.map(row => row.category)
    const allActions = allActionsResult.rows

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

    return NextResponse.json({
      success: true,
      pdf_url: pdfUrl,
      emails_sent: emailResults.sent.length,
      recipients: emailResults.sent
    })
  } catch (error) {
    console.error('Error submitting inspection:', error)
    return NextResponse.json(
      { error: 'Failed to submit inspection', details: error.message },
      { status: 500 }
    )
  }
}
