import { NextResponse } from 'next/server'
import { auth, currentUser } from '@clerk/nextjs/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '@/lib/db'
import { getCurrentUserEmail, getCurrentUserName } from '@/lib/auth'
import {
  extractCaretakerRecipients,
  findRecipientQuestion,
  isCaretakerTemplate,
} from '@/lib/caretaker-template'
import { applyTemplateDisplayPatches } from '@/lib/caretaker-fire-template-patch'
import {
  buildCaretakerActionDescription,
  shouldAutocreateCaretakerAction,
  shouldAutocreateCaretakerGradedAction,
  normalizeYesNoAnswer,
} from '@/lib/caretaker-action-details'
import { parseCaretakerAnswerNotes } from '@/lib/caretaker-answer-extras'
import { findSectionCostCodeAnswer } from '@/lib/caretaker-section-cost-code'
import { resolveStoredQuestionType } from '@/lib/resolveStoredQuestionType'
import { resolveIssueRoutingRecipient } from '@/lib/resolve-issue-routing'
import { deriveInspectionGrading } from '@/lib/deriveInspectionGrading'
import { generatePosterPdfBuffer } from '../../../../../lib/poster-pdf'
import { uploadInspectionPdfToBlob } from '../../../../../lib/blob/uploadPdf'
import { sendEmails } from '@/lib/email-sender'
import { applyNeighbourhoodVoiceTemplatePatch } from '@/lib/neighbourhood-voice-template-patch'
import { isNeighbourhoodVoiceTemplateVersion } from '@/lib/neighbourhood-voice-question-schema'
import { createNeighbourhoodVoiceAutoActions } from '@/lib/neighbourhood-voice-submit-actions'
import { isEstateWalkaboutTemplateVersion } from '@/lib/estate-walkabout-template'
import {
  applyGroundsMaintenanceTemplateToSnapshot,
  isGroundsMaintenanceTemplate,
} from '@/lib/grounds-maintenance-template'
import { createEstateWalkaboutActionsFromInspection } from '@/lib/estate-walkabout-actions'
import { isEsmInspectionFormTemplate } from '@/lib/esm-inspection-form'
import {
  tryGenerateAndStoreIssueJobCardPdf,
  formatAssignedTeamLabel,
  formatDateGb,
} from '@/lib/issue-job-card-upload'
import { getAppRoleContextForClerkUser, roleMayCreateInspectionWithTemplate } from '@/lib/app-role-access'
import { getInspectionFullReportPdfUrl } from '@/lib/inspection-pdf-fields'

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
      templateVersion = applyGroundsMaintenanceTemplateToSnapshot(templateVersion)
      applyNeighbourhoodVoiceTemplatePatch(templateVersion)
      applyTemplateDisplayPatches(templateVersion)
    }

    const cuSubmit = await currentUser()
    const roleCtxSubmit = await getAppRoleContextForClerkUser(userId, cuSubmit?.publicMetadata?.isAdmin === true)
    const templateForRoleCheck = templateVersion && typeof templateVersion === 'object'
      ? {
          id: templateVersion.id ?? inspection.template_id,
          name: templateVersion.name ?? inspection.template_name,
          template_key: templateVersion.template_key,
          template_type: templateVersion.template_type ?? templateVersion.type,
          type: templateVersion.type ?? templateVersion.template_type,
          sections: templateVersion.sections,
        }
      : null
    if (
      templateForRoleCheck &&
      !roleMayCreateInspectionWithTemplate(roleCtxSubmit.normalized, roleCtxSubmit.clerkIsAdmin, templateForRoleCheck)
    ) {
      return NextResponse.json(
        { error: 'Forbidden: your role cannot submit this inspection type' },
        { status: 403 }
      )
    }
    if (
      templateForRoleCheck &&
      (isCaretakerTemplate(templateForRoleCheck) ||
        isEsmInspectionFormTemplate(templateForRoleCheck) ||
        isGroundsMaintenanceTemplate(templateForRoleCheck)) &&
      !String(inspection.block_id || '').trim()
    ) {
      return NextResponse.json({ error: 'Location is required' }, { status: 400 })
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
          work_type = COALESCE(work_type, CASE
            WHEN COALESCE(is_scheduled, false) = true THEN 'caretaker_scheduled'
            WHEN lower(COALESCE(type, '')) = 'estate_walkabout' OR lower(COALESCE(template_name, '')) LIKE '%walkabout%' THEN 'housing_walkabout'
            WHEN lower(COALESCE(template_name, '')) LIKE '%caretaker%' THEN 'caretaker_scheduled'
            WHEN lower(COALESCE(template_name, '')) LIKE '%esm%' THEN 'esm_adhoc'
            ELSE 'esm_adhoc'
          END),
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
        } else if (isEstateWalkaboutTemplateVersion(templateVersion)) {
          try {
            const est = await sql`
              SELECT e.name AS estate_name
              FROM inspections i
              LEFT JOIN estates e ON e.id = i.estate_id
              WHERE i.id = ${id}
              LIMIT 1
            `
            const estateName = est.rows[0]?.estate_name || ''
            const wr = await createEstateWalkaboutActionsFromInspection(sql, {
              inspectionId: id,
              templateVersion,
              answersRows: answersResult.rows,
              answersMap: answers,
              estateName,
              inspectorName: inspectionLive.inspector_name || inspectorName,
              inspectorEmail,
              locationLine: estateBlockLine,
              submittedAt: inspectionLive.submitted_at || new Date().toISOString(),
              inspectionTypeLabel: templateVersion?.name || inspectionLive.template_name || '',
            })
            for (const w of wr.warnings || []) {
              actionCreationWarnings.push(w)
            }
          } catch (ewErr) {
            console.error('[inspections/submit] estate walkabout actions:', ewErr)
            actionCreationWarnings.push(
              `Estate walkabout actions: ${ewErr?.message || String(ewErr)}`
            )
          }
        } else {
          const sections = (templateVersion && templateVersion.sections) || []
          const completedAt = new Date().toISOString()
          const inspectionBlockId = inspectionLive.block_id || inspection.block_id || null
          for (const sec of sections) {
            const recipientQ = findRecipientQuestion(sec.questions || [])
            const recipientId =
              recipientQ && answers[recipientQ.id] != null && answers[recipientQ.id] !== ''
                ? answers[recipientQ.id]
                : null
            const sectionCostCode = findSectionCostCodeAnswer(sec, answers)

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
              const extras = parseCaretakerAnswerNotes(answerRow?.notes)
              const comment = extras.comment || ''
              const category = q.action_category || q.category || 'other'
              const qText = q.question_text || q.label || q.id
              const norm = normalizeYesNoAnswer(val)
              const answerLabel = norm === 'yes' ? 'Yes' : norm === 'no' ? 'No' : String(val ?? '')
              const photosResult = await sql`
                SELECT id, blob_url FROM inspection_photos
                WHERE inspection_id = ${id} AND question_id = ${q.id}
              `
              const dbPhotoUrls = photosResult.rows.map((p) => p.blob_url).filter(Boolean)
              const photoUrlsArr = [...new Set([...dbPhotoUrls, ...extras.extraPhotoUrls])]
              const photoRefs = photoUrlsArr.join('; ')
              const costCode = extras.costCode || sectionCostCode || null
              let actionRecipient =
                (extras.recipient_person_id && String(extras.recipient_person_id).trim()) ||
                (recipientId != null ? String(recipientId).trim() : '') ||
                null
              if (!actionRecipient) {
                const routed = await resolveIssueRoutingRecipient(sql, {
                  issueCategory: category,
                  issueType: q.issue_type ? String(q.issue_type) : null,
                  estateId: inspectionLive.estate_id || inspection.estate_id || null,
                  assignToRoleFallback: null,
                })
                actionRecipient = routed?.personId || null
              }
              const priorityVal = extras.priority || q.action_priority || null
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
                assigneeLabel: actionRecipient ? `Person id ${actionRecipient}` : '',
                submittedBy: inspectionLive.inspector_name || inspectorName || inspectorEmail || '',
              })
              const actionId = `action_${id}_${q.id}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
              try {
                await sql`
                  INSERT INTO actions (
                    id, inspection_id, section_id, section_name, question_id,
                    category, priority, title, description, location, status,
                    comment, recipient_person_id, auto_created, photo_urls,
                    block_id, cost_code
                  )
                  VALUES (
                    ${actionId}, ${id}, ${sec.id}, ${sec.title || sec.name}, ${q.id},
                    ${category}, ${priorityVal}, ${title}, ${description}, ${estateBlockLine || null}, 'open',
                    ${comment || null}, ${actionRecipient}, true, ${JSON.stringify(photoUrlsArr)},
                    ${inspectionBlockId}, ${costCode}
                  )
                `
              } catch (insertErr) {
                console.error('[inspections/submit] caretaker action insert failed:', insertErr)
                actionCreationWarnings.push(
                  `Could not create action for question ${q.id}: ${insertErr?.message || insertErr}`
                )
                continue
              }
              try {
                const team = await formatAssignedTeamLabel(sql, actionRecipient)
                const detail = [comment, description].filter(Boolean).join('\n\n').slice(0, 2500)
                const issueTypeLabel = String(category || 'issue').replace(/_/g, ' ')
                const pdfR = await tryGenerateAndStoreIssueJobCardPdf(sql, {
                  actionId,
                  inspectionId: id,
                  inspectionType: inspectionLive.template_name || 'Inspection',
                  blockEstate: estateBlockLine || '—',
                  location: estateBlockLine || '—',
                  exactLocation: estateBlockLine || '—',
                  dateRaised: formatDateGb(completedAt),
                  dateSent: formatDateGb(completedAt),
                  issueTitle: title,
                  issueType: issueTypeLabel,
                  issueDetail: detail,
                  priority: priorityVal ? String(priorityVal).replace(/_/g, ' ') : 'As assessed',
                  assignedTeam: team,
                  targetCompletionDate: 'TBC',
                  jobNumber: 'Pending assignment',
                  status: 'Open',
                  photoUrls: photoUrlsArr,
                })
                if (!pdfR?.ok) {
                  actionCreationWarnings.push(
                    `Issue job card PDF not saved for action ${actionId}: ${pdfR?.error || 'unknown'}`
                  )
                }
              } catch (pdfErr) {
                console.error('[inspections/submit] issue job card PDF:', pdfErr)
                actionCreationWarnings.push(
                  `Issue job card PDF failed for ${actionId}: ${pdfErr?.message || String(pdfErr)}`
                )
              }
            }

            for (const q of sec.questions || []) {
              if (!q || !q.id) continue
              if (resolveStoredQuestionType(q) !== 'graded') continue
              const gradeVal = answers[q.id]
              if (!shouldAutocreateCaretakerGradedAction(q, gradeVal)) continue
              const existingG = await sql`
                SELECT id FROM actions
                WHERE inspection_id = ${id} AND question_id = ${q.id} AND status = 'open'
                LIMIT 1
              `
              if (existingG.rows.length > 0) continue
              const answerRow = answersResult.rows.find((r) => r.question_id === q.id)
              const extras = parseCaretakerAnswerNotes(answerRow?.notes)
              const comment = extras.comment || ''
              const category = q.action_category || q.category || 'other'
              const qText = q.question_text || q.label || q.id
              const answerLabel = String(gradeVal ?? '').trim() || '—'
              const photosResult = await sql`
                SELECT id, blob_url FROM inspection_photos
                WHERE inspection_id = ${id} AND question_id = ${q.id}
              `
              const dbPhotoUrls = photosResult.rows.map((p) => p.blob_url).filter(Boolean)
              const photoUrlsArr = [...new Set([...dbPhotoUrls, ...extras.extraPhotoUrls])]
              const photoRefs = photoUrlsArr.join('; ')
              const costCode = extras.costCode || sectionCostCode || null
              let actionRecipient =
                (extras.recipient_person_id && String(extras.recipient_person_id).trim()) ||
                (recipientId != null ? String(recipientId).trim() : '') ||
                null
              if (!actionRecipient) {
                const routed = await resolveIssueRoutingRecipient(sql, {
                  issueCategory: category,
                  issueType: q.issue_type ? String(q.issue_type) : null,
                  estateId: inspectionLive.estate_id || inspection.estate_id || null,
                  assignToRoleFallback: null,
                })
                actionRecipient = routed?.personId || null
              }
              const priorityVal = extras.priority || q.action_priority || null
              const title = `${sec.title || sec.name || 'Section'} – ${qText} (grade ${answerLabel})`
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
                assigneeLabel: actionRecipient ? `Person id ${actionRecipient}` : '',
                submittedBy: inspectionLive.inspector_name || inspectorName || inspectorEmail || '',
              })
              const actionId = `action_${id}_${q.id}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
              try {
                await sql`
                  INSERT INTO actions (
                    id, inspection_id, section_id, section_name, question_id,
                    category, priority, title, description, location, status,
                    comment, recipient_person_id, auto_created, photo_urls,
                    block_id, cost_code
                  )
                  VALUES (
                    ${actionId}, ${id}, ${sec.id}, ${sec.title || sec.name}, ${q.id},
                    ${category}, ${priorityVal}, ${title}, ${description}, ${estateBlockLine || null}, 'open',
                    ${comment || null}, ${actionRecipient}, true, ${JSON.stringify(photoUrlsArr)},
                    ${inspectionBlockId}, ${costCode}
                  )
                `
              } catch (insertErr) {
                console.error('[inspections/submit] graded caretaker action insert failed:', insertErr)
                actionCreationWarnings.push(
                  `Could not create graded action for question ${q.id}: ${insertErr?.message || insertErr}`
                )
                continue
              }
              try {
                const teamG = await formatAssignedTeamLabel(sql, actionRecipient)
                const detailG = [comment, description, `Grade: ${answerLabel}`].filter(Boolean).join('\n\n').slice(0, 2500)
                const issueTypeGraded = String(category || 'issue').replace(/_/g, ' ')
                const pdfG = await tryGenerateAndStoreIssueJobCardPdf(sql, {
                  actionId,
                  inspectionId: id,
                  inspectionType: inspectionLive.template_name || 'Inspection',
                  blockEstate: estateBlockLine || '—',
                  location: estateBlockLine || '—',
                  exactLocation: estateBlockLine || '—',
                  dateRaised: formatDateGb(completedAt),
                  dateSent: formatDateGb(completedAt),
                  issueTitle: title,
                  issueType: `${issueTypeGraded} (grade ${answerLabel})`,
                  issueDetail: detailG,
                  priority: priorityVal ? String(priorityVal).replace(/_/g, ' ') : `Grade ${answerLabel}`,
                  assignedTeam: teamG,
                  targetCompletionDate: 'TBC',
                  jobNumber: 'Pending assignment',
                  status: 'Open',
                  photoUrls: photoUrlsArr,
                })
                if (!pdfG?.ok) {
                  actionCreationWarnings.push(
                    `Issue job card PDF not saved for action ${actionId}: ${pdfG?.error || 'unknown'}`
                  )
                }
              } catch (pdfErr) {
                console.error('[inspections/submit] graded issue job card PDF:', pdfErr)
                actionCreationWarnings.push(
                  `Issue job card PDF failed for ${actionId}: ${pdfErr?.message || String(pdfErr)}`
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

    // Get all actions (for PDF poster and emails) — must not 500 the response after submit
    let allActions = []
    try {
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
      allActions = allActionsResult.rows
    } catch (loadActionsErr) {
      console.error('[inspections/submit] loading actions for poster/email failed:', loadActionsErr)
      actionCreationWarnings.push(
        `Could not load open actions for this inspection: ${loadActionsErr?.message || String(loadActionsErr)}`
      )
    }

    // Full inspection report PDF is generated on demand (Home / report-pdf API), not on submit.
    const fullPdfUrl = getInspectionFullReportPdfUrl(inspectionLive)
    let posterPdfUrl = inspectionLive.poster_pdf_url || null
    let pdfError = null
    try {
      if (allActions.length > 0) {
        try {
          const posterPdfBytes = await generatePosterPdfBuffer(inspectionLive, allActions)
          posterPdfUrl = await uploadInspectionPdfToBlob({
            inspectionId: id,
            pdfBytes: posterPdfBytes,
            kind: 'poster',
          })
        } catch (posterErr) {
          console.error('[inspections/submit] poster PDF failed:', posterErr)
          pdfError = posterErr?.message || String(posterErr)
        }
      }

      const truncatedErr = pdfError && pdfError.length > 2000 ? pdfError.slice(0, 2000) : pdfError
      await sql`
        UPDATE inspections
        SET poster_pdf_url = COALESCE(${posterPdfUrl}, poster_pdf_url),
            pdf_generation_error = ${truncatedErr}
        WHERE id = ${id}
      `
    } catch (pdfErr) {
      pdfError = pdfErr?.message || String(pdfErr)
      console.error('[inspections/submit] poster PDF update failed:', pdfError)
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
      applyGroundsMaintenanceTemplateToSnapshot(emailVersion)
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
    
    // Get actions grouped by category (must not fail the HTTP response after inspection is submitted)
    let actionsResult = { rows: [] }
    try {
      actionsResult = await sql`
        SELECT 
          category, 
          COUNT(*) as count,
          STRING_AGG(DISTINCT section_name || ' – ' || title, '; ') as action_list
        FROM actions 
        WHERE inspection_id = ${id} AND status = 'open'
        GROUP BY category
      `
    } catch (actionsAggErr) {
      console.error('[inspections/submit] actions aggregation query failed:', actionsAggErr)
      actionCreationWarnings.push(
        `Could not aggregate actions for email context: ${actionsAggErr?.message || String(actionsAggErr)}`
      )
    }

    // Send emails (must not fail the submit response)
    let emailResults = { sent: [], failed: [] }
    try {
      emailResults = await sendEmails({
        sql,
        inspectionId: id,
        inspection: {
          ...inspectionLive,
          full_pdf_url: fullPdfUrl ?? inspectionLive.full_pdf_url ?? null,
          poster_pdf_url: posterPdfUrl ?? inspectionLive.poster_pdf_url ?? null,
        },
        estateBlockLine,
        fullPdfUrl,
        posterPdfUrl,
        recipients,
        actionCategories: actionsResult.rows,
        allActions,
      })
    } catch (emailErr) {
      console.error('[inspections/submit] sendEmails threw:', emailErr)
      actionCreationWarnings.push(`Email sending error: ${emailErr?.message || String(emailErr)}`)
    }

    // Save recipient records (best-effort — inspection is already submitted)
    const sentList = Array.isArray(emailResults?.sent) ? emailResults.sent : []
    for (let i = 0; i < sentList.length; i++) {
      const recipient = sentList[i]
      const emailAddr = recipient?.email != null ? String(recipient.email).trim() : ''
      if (!emailAddr) {
        actionCreationWarnings.push('Skipped saving an inspection_recipients row (missing email on sent record).')
        continue
      }
      try {
        const rid = `recipient_${id}_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 11)}`
        await sql`
          INSERT INTO inspection_recipients (
            id, inspection_id, person_id, person_email, recipient_type, sent_at
          ) VALUES (
            ${rid},
            ${id},
            ${recipient.person_id || null},
            ${emailAddr},
            ${recipient.type || 'targeted'},
            CURRENT_TIMESTAMP
          )
        `
      } catch (recErr) {
        console.error('[inspections/submit] inspection_recipients insert failed:', recErr)
        actionCreationWarnings.push(
          `Could not save recipient audit row (${emailAddr}): ${recErr?.message || String(recErr)}`
        )
      }
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
