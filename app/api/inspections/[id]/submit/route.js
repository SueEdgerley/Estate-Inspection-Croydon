import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '@/lib/db'
import { getCurrentUserEmail, getCurrentUserName } from '@/lib/auth'
import {
  extractCaretakerRecipients,
  findRecipientQuestion,
  isCaretakerTemplate,
} from '@/lib/caretaker-template'
import { patchCaretakerTemplateForFireSafety } from '@/lib/caretaker-fire-template-patch'
import {
  buildCaretakerActionDescription,
  shouldAutocreateCaretakerAction,
  normalizeYesNoAnswer,
} from '@/lib/caretaker-action-details'
import { deriveInspectionGrading } from '@/lib/deriveInspectionGrading'
import { buildInspectionReportPdf } from '../../../../../lib/pdf/buildInspectionReportPdf'
import { generatePosterPdfBuffer } from '../../../../../lib/poster-pdf'
import { uploadInspectionPdfToBlob } from '../../../../../lib/blob/uploadPdf'
import { sendEmails } from '@/lib/email-sender'
import {
  applyNeighbourhoodVoiceTemplatePatch,
  isNeighbourhoodVoiceQuestionRenderable,
} from '@/lib/neighbourhood-voice-template-patch'
import { isNeighbourhoodVoiceTemplateVersion } from '@/lib/neighbourhood-voice-question-schema'
import { createNeighbourhoodVoiceAutoActions } from '@/lib/neighbourhood-voice-submit-actions'
import { unpackNvWizardNotes } from '@/lib/nv-notes-pack'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST - Submit inspection (generate PDF and send emails)
export async function POST(request, { params }) {
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
    const { id } = await params
    const inspectorEmail = await getCurrentUserEmail()
    const inspectorName = await getCurrentUserName()

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

    let templateVersion = inspection.template_version
    if (typeof templateVersion === 'string') {
      try {
        templateVersion = JSON.parse(templateVersion)
      } catch {
        templateVersion = null
      }
    }
    if (templateVersion && typeof templateVersion === 'object') {
      applyNeighbourhoodVoiceTemplatePatch(templateVersion)
      if (
        isCaretakerTemplate({
          name: templateVersion.name || templateVersion.template_name || inspection.template_name,
          template_type: templateVersion.template_type || templateVersion.type || inspection.template_type,
          type: templateVersion.type || templateVersion.template_type,
        })
      ) {
        patchCaretakerTemplateForFireSafety(templateVersion)
      }
    }

    const gradingValue = deriveInspectionGrading(templateVersion ?? inspection.template_version, answers)
    const isNv = isNeighbourhoodVoiceTemplateVersion(templateVersion)
    const wasDraft = inspection.status === 'draft'

    const locRow = await sql`
      SELECT COALESCE(NULLIF(CONCAT_WS(' / ', e.name, b.name), ''), i.location_label, i.title) AS location_line
      FROM inspections i
      LEFT JOIN estates e ON e.id = i.estate_id
      LEFT JOIN blocks b ON b.id = i.block_id
      WHERE i.id = ${id}
      LIMIT 1
    `
    const estateBlockLine = String(locRow.rows[0]?.location_line || inspection.location_label || inspection.title || '').trim()

    // Mark submitted first so inspection completion never depends on action rows or email.
    await sql`
      UPDATE inspections
      SET status = 'submitted',
          submitted_at = CURRENT_TIMESTAMP,
          pdf_generation_error = NULL,
          grading = COALESCE(${gradingValue}, grading),
          inspector_id = COALESCE(NULLIF(TRIM(inspector_id), ''), ${inspectorEmail}),
          inspector_name = COALESCE(NULLIF(TRIM(inspector_name), ''), ${inspectorName})
      WHERE id = ${id}
    `

    const refreshedResult = await sql`
      SELECT * FROM inspections WHERE id = ${id}
    `
    const inspectionLive = refreshedResult.rows[0] || inspection

    const actionCreationWarnings = []
    if (wasDraft) {
      try {
        if (isNv) {
          await createNeighbourhoodVoiceAutoActions(sql, {
            inspectionId: id,
            inspection: inspectionLive,
            templateVersion,
            answersRows: answersResult.rows,
          })
        } else {
          const sections = (templateVersion && templateVersion.sections) || []
          const completedAt = new Date().toISOString()
          for (const sec of sections) {
            const recipientQ = findRecipientQuestion(sec.questions || [])
            const recipientId =
              recipientQ && answers[recipientQ.id] != null && answers[recipientQ.id] !== ''
                ? answers[recipientQ.id]
                : null
            for (const q of sec.questions || []) {
              if (!q || !q.id) continue
              const val = answers[q.id]
              if (!shouldAutocreateCaretakerAction(q, val, sec)) continue
              const existing = await sql`
                SELECT id FROM actions
                WHERE inspection_id = ${id} AND question_id = ${q.id} AND status = 'open'
                LIMIT 1
              `
              if (existing.rows.length > 0) continue
              const answerRow = answersResult.rows.find((r) => r.question_id === q.id)
              const comment = (answerRow && answerRow.notes) || ''
              const category = q.action_category || q.category || 'other'
              const qText = q.question_text || q.label || q.id
              const norm = normalizeYesNoAnswer(val)
              const answerLabel = norm === 'yes' ? 'Yes' : norm === 'no' ? 'No' : String(val ?? '')
              const photosResult = await sql`
                SELECT id, blob_url FROM inspection_photos
                WHERE inspection_id = ${id} AND question_id = ${q.id}
              `
              const photoUrlsArr = photosResult.rows.map((p) => p.blob_url).filter(Boolean)
              const photoRefs = photosResult.rows.map((p) => p.blob_url || p.id).filter(Boolean).join('; ')
              const title = `${sec.title || sec.name || 'Section'} – ${qText}`
              const description = buildCaretakerActionDescription({
                inspectionId: id,
                completedAtIso: completedAt,
                estateBlockLine,
                sectionName: sec.title || sec.name || '',
                questionText: qText,
                answerLabel,
                comment,
                photoRefs,
                category,
                assigneeLabel: recipientId ? `Person id ${recipientId}` : '',
                submittedBy: inspectionLive.inspector_name || inspectorName || inspectorEmail || '',
              })
              const actionId = `action_${id}_${q.id}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
              try {
                await sql`
                  INSERT INTO actions (
                    id, inspection_id, section_id, section_name, question_id,
                    category, priority, title, description, location, status,
                    comment, recipient_person_id, auto_created, photo_urls
                  )
                  VALUES (
                    ${actionId}, ${id}, ${sec.id}, ${sec.title || sec.name}, ${q.id},
                    ${category}, null, ${title}, ${description}, null, 'open',
                    ${comment || null}, ${recipientId}, true, ${JSON.stringify(photoUrlsArr)}
                  )
                `
              } catch (insertErr) {
                console.error('[inspections/submit] caretaker action insert failed:', insertErr)
                actionCreationWarnings.push(
                  `Could not create action for question ${q.id}: ${insertErr?.message || insertErr}`
                )
              }
            }
          }
        }
      } catch (draftActionErr) {
        console.error('[inspections/submit] draft action creation failed:', draftActionErr)
        actionCreationWarnings.push(
          `Action creation had errors: ${draftActionErr?.message || String(draftActionErr)}`
        )
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

    let fullPdfUrl = null
    let posterPdfUrl = null
    let pdfError = null
    try {
      const answerByQuestionId = {}
      for (const row of answersResult.rows) {
        answerByQuestionId[row.question_id] =
          row.answer_value ||
          row.answer_text ||
          (row.answer_boolean != null ? (row.answer_boolean ? 'Yes' : 'No') : row.answer_number) ||
          ''
      }

      const photosResult = await sql`
        SELECT question_id, blob_url, filename
        FROM inspection_photos
        WHERE inspection_id = ${id}
      `
      const photosByQuestionId = {}
      for (const p of photosResult.rows) {
        if (!p.question_id || !p.blob_url) continue
        if (!photosByQuestionId[p.question_id]) photosByQuestionId[p.question_id] = []
        photosByQuestionId[p.question_id].push({
          url: p.blob_url,
          caption: p.filename || undefined,
          linkedQuestionId: p.question_id,
        })
      }

      const openActionQuestionIds = new Set(
        allActions.map((a) => a.question_id).filter(Boolean)
      )
      let pdfVersion = inspectionLive.template_version || {}
      if (typeof pdfVersion === 'string') {
        try {
          pdfVersion = JSON.parse(pdfVersion)
        } catch {
          pdfVersion = {}
        }
      }
      if (pdfVersion && typeof pdfVersion === 'object') {
        applyNeighbourhoodVoiceTemplatePatch(pdfVersion)
      }
      const sections = Array.isArray(pdfVersion.sections) ? pdfVersion.sections : []
      const pdfSections = []
      const pdfPhotos = []

      for (const section of sections) {
        const sectionQuestions = []
        for (const question of section.questions || []) {
          if (question.nv_hidden) continue
          if (!isNeighbourhoodVoiceQuestionRenderable(question)) continue
          const qid = question.id
          const answerVal = answerByQuestionId[qid] ?? ''
          const answerRow = answersResult.rows.find((r) => r.question_id === qid)
          const unpacked = unpackNvWizardNotes(answerRow?.notes)
          const comment =
            (unpacked.structured && typeof unpacked.structured.comment === 'string'
              ? unpacked.structured.comment
              : '') || unpacked.plainComment || ''

          sectionQuestions.push({
            id: qid,
            text: question.resident_wording || question.question_text || question.label || '',
            answer: String(answerVal),
            comment: comment || undefined,
            grade: question.grading_scheme_name ? String(answerVal) : undefined,
            actionCreated: openActionQuestionIds.has(qid),
          })

          const questionPhotos = photosByQuestionId[qid] || []
          for (const qp of questionPhotos) pdfPhotos.push(qp)
        }
        if (sectionQuestions.length > 0) {
          pdfSections.push({
            title: section.title || section.name || 'Section',
            questions: sectionQuestions,
          })
        }
      }

      const fullPdfBytes = await buildInspectionReportPdf({
        inspectionId: id,
        templateName: inspectionLive.template_name || pdfVersion.name || 'Template',
        blockName: inspectionLive.title || inspectionLive.location_label || 'Block',
        completedAt: inspectionLive.submitted_at || new Date().toISOString(),
        officerName: inspectionLive.inspector_name || 'Officer',
        sections: pdfSections,
        photos: pdfPhotos,
      })
      fullPdfUrl = await uploadInspectionPdfToBlob({
        inspectionId: id,
        pdfBytes: fullPdfBytes,
        kind: 'report',
      })

      if (allActions.length > 0) {
        const posterPdfBytes = await generatePosterPdfBuffer(inspectionLive, allActions)
        posterPdfUrl = await uploadInspectionPdfToBlob({
          inspectionId: id,
          pdfBytes: posterPdfBytes,
          kind: 'poster',
        })
      }

      await sql`
        UPDATE inspections
        SET pdf_url = ${fullPdfUrl},
            full_pdf_url = ${fullPdfUrl},
            poster_pdf_url = ${posterPdfUrl},
            pdf_generation_error = NULL
        WHERE id = ${id}
      `
    } catch (pdfErr) {
      pdfError = pdfErr?.message || String(pdfErr)
      console.error('[inspections/submit] PDF generation failed:', pdfError)
      const truncated = pdfError.length > 2000 ? pdfError.slice(0, 2000) : pdfError
      await sql`
        UPDATE inspections
        SET pdf_generation_error = ${truncated}
        WHERE id = ${id}
      `
    }

    // Extract recipients from persisted template snapshot (no live Airtable dependency)
    let recipients = []
    let emailVersion = inspectionLive.template_version
    if (typeof emailVersion === 'string') {
      try {
        emailVersion = JSON.parse(emailVersion)
      } catch {
        emailVersion = null
      }
    }
    if (emailVersion && typeof emailVersion === 'object') {
      applyNeighbourhoodVoiceTemplatePatch(emailVersion)
    }
    const versionSections = (emailVersion && emailVersion.sections) || []
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

    // Send emails (must not fail the submit response)
    let emailResults = { sent: [], failed: [] }
    try {
      emailResults = await sendEmails({
        inspection: inspectionLive,
        recipients,
        actionCategories: actionsResult.rows,
        allActions,
        pdfUrl: fullPdfUrl,
      })
    } catch (emailErr) {
      console.error('[inspections/submit] sendEmails threw:', emailErr)
    }

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

    return NextResponse.json(
      {
        inspectionId: id,
        pdfUrl: fullPdfUrl || null,
        fullPdfUrl: fullPdfUrl || null,
        posterPdfUrl: posterPdfUrl || null,
        emails_sent: Array.isArray(emailResults?.sent) ? emailResults.sent.length : 0,
        ...(Array.isArray(emailResults?.failed) && emailResults.failed.length > 0
          ? { email_failures: emailResults.failed }
          : {}),
        ...(actionCreationWarnings.length > 0 ? { action_creation_warnings: actionCreationWarnings } : {}),
        ...(pdfError ? { pdfError } : {}),
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Error submitting inspection:', error)
    return NextResponse.json(
      { error: 'Failed to submit inspection', details: error.message },
      { status: 500 }
    )
  }
}
