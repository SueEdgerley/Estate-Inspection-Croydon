import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '@/lib/db'
import { getTemplatesNested } from '@/lib/airtable-client'
import { getCurrentUserEmail, getCurrentUserName, isAdmin } from '@/lib/auth'
import { buildInspectionReportPdf } from '@/lib/pdf/buildInspectionReportPdf'
import { generatePosterPdfBuffer } from '@/lib/poster-pdf'
import { uploadInspectionPdfToBlob } from '@/lib/blob/uploadPdf'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const { userId } = await auth()
  console.log('auth userId', userId)
  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    await ensureDatabase()
    const pgUrl = getPgUrl()
    if (!pgUrl) {
      return NextResponse.json(
        { error: 'Database not configured. Please set up Postgres.' },
        { status: 503 }
      )
    }
    const userEmail = await getCurrentUserEmail()
    const admin = await isAdmin()
    let result
    if (admin) {
      result = await sql`
        SELECT id, type, location_label, inspector_name, inspector_id, template_id, template_name,
               due_date, submitted_at, grading, pdf_url, status, is_scheduled, title, description, created_at, updated_at
        FROM inspections
        ORDER BY submitted_at DESC NULLS LAST, created_at DESC
        LIMIT 200
      `
    } else if (userEmail) {
      result = await sql`
        SELECT id, type, location_label, inspector_name, inspector_id, template_id, template_name,
               due_date, submitted_at, grading, pdf_url, status, is_scheduled, title, description, created_at, updated_at
        FROM inspections
        WHERE inspector_id = ${userEmail}
        ORDER BY submitted_at DESC NULLS LAST, created_at DESC
        LIMIT 200
      `
    } else {
      result = await sql`
        SELECT id, type, location_label, inspector_name, inspector_id, template_id, template_name,
               due_date, submitted_at, grading, pdf_url, status, is_scheduled, title, description, created_at, updated_at
        FROM inspections
        ORDER BY submitted_at DESC NULLS LAST, created_at DESC
        LIMIT 50
      `
    }
    return NextResponse.json(result.rows)
  } catch (error) {
    console.error('Error listing inspections:', error)
    return NextResponse.json(
      { error: 'Failed to list inspections', details: error?.message },
      { status: 500 }
    )
  }
}

export async function POST(request) {
  const { userId } = await auth()
  console.log('auth userId', userId)
  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const hasKey = process.env.AIRTABLE_API_TOKEN || process.env.AIRTABLE_API_KEY || process.env.AIRTABLE_TOKEN
  if (!process.env.AIRTABLE_BASE_ID?.trim() || !hasKey?.trim()) {
    return NextResponse.json(
      { error: 'Airtable not configured. Set AIRTABLE_BASE_ID and AIRTABLE_API_KEY or AIRTABLE_API_TOKEN.' },
      { status: 503 }
    )
  }

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (body && body.test === true) {
    return NextResponse.json({
      ok: true,
      message: 'POST /api/inspections reachable',
      userId,
    })
  }

  const { template_id, title, location, description, estate_id: bodyEstateId, block_id: bodyBlockId, answers = {}, answer_extras = {} } = body

  if (!template_id) {
    return NextResponse.json(
      { error: 'template_id is required' },
      { status: 400 }
    )
  }

  if (!getPgUrl()) {
    return NextResponse.json(
      { error: 'Database not configured. Please set up Postgres.' },
      { status: 503 }
    )
  }

  const inspectorEmail = await getCurrentUserEmail()
  const inspectorName = await getCurrentUserName()

  try {
    const nested = await getTemplatesNested()
    const template = nested.find((t) => t.id === template_id)
    if (!template) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 400 }
      )
    }

    const inspectionId = crypto.randomUUID()

    const templateVersionSnapshot = JSON.stringify({
      id: template.id,
      name: template.name,
      sections: (template.sections || []).map((sec) => ({
        id: sec.id,
        title: sec.title ?? sec.name,
        questions: (sec.questions || []).map((q) => ({
          id: q.id,
          question_text: q.question_text ?? q.label,
          question_type: q.question_type,
          options: q.options,
          action_category: q.action_category,
          triggers_task: q.triggers_task,
          triggers_email: q.triggers_email,
          email_routing: q.email_routing,
          issue_type: q.issue_type,
          programme_tag: q.programme_tag,
          category: q.category,
        })),
      })),
    })

    const estateId = bodyEstateId && String(bodyEstateId).trim() ? String(bodyEstateId).trim() : null
    const blockId = bodyBlockId && String(bodyBlockId).trim() ? String(bodyBlockId).trim() : null

    await ensureDatabase()

    const displayTitle = (typeof title === 'string' && title.trim())
      ? title.trim()
      : [template.name, location && String(location).trim()].filter(Boolean).join(' – ') || inspectionId.slice(0, 8)

    await sql`
      INSERT INTO inspections (
        id, legacy_inspection_id, type, title, description, location_label,
        template_id, template_name, template_version, status, submitted_at, created_at, updated_at,
        inspector_id, inspector_name, estate_id, block_id
      )
      VALUES (
        ${inspectionId},
        NULL,
        'inspection',
        ${displayTitle},
        ${description && String(description).trim() ? String(description).trim() : null},
        ${location && String(location).trim() ? String(location).trim() : null},
        ${template_id},
        ${template.name || null},
        ${templateVersionSnapshot}::jsonb,
        'submitted',
        ${new Date()},
        ${new Date()},
        ${new Date()},
        ${inspectorEmail || null},
        ${inspectorName || null},
        ${estateId},
        ${blockId}
      )
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        location_label = EXCLUDED.location_label,
        template_id = EXCLUDED.template_id,
        template_name = EXCLUDED.template_name,
        template_version = EXCLUDED.template_version,
        status = EXCLUDED.status,
        submitted_at = EXCLUDED.submitted_at,
        inspector_id = COALESCE(EXCLUDED.inspector_id, inspections.inspector_id),
        inspector_name = COALESCE(EXCLUDED.inspector_name, inspections.inspector_name),
        estate_id = COALESCE(EXCLUDED.estate_id, inspections.estate_id),
        block_id = COALESCE(EXCLUDED.block_id, inspections.block_id),
        updated_at = ${new Date()}
    `

    const questionsById = new Map()
    template.sections.forEach((sec) => {
      ;(sec.questions || []).forEach((q) => questionsById.set(q.id, { ...q, sectionId: sec.id }))
    })

    // Persist answers into Postgres inspection_answers (system of record)
    try {
      for (const [questionId, answer] of Object.entries(answers)) {
          if (answer === undefined || answer === null) continue
          const question = questionsById.get(questionId)
          if (!question) continue
          const extras = answer_extras[questionId] || {}
          const comment = typeof extras.comment === 'string' ? extras.comment.trim() : ''

          const questionType = question.question_type || 'text'
          const rawValue = typeof answer === 'string' ? answer : String(answer)
          const lower = String(answer).toLowerCase()
          const answerBoolean =
            questionType === 'yes_no'
              ? (lower === 'yes' ? true : lower === 'no' ? false : null)
              : null
          const asNumber = Number(answer)
          const answerNumber =
            questionType === 'number' && Number.isFinite(asNumber) ? asNumber : null

          const answerId = `answer_${inspectionId}_${questionId}`

          await sql`
            INSERT INTO inspection_answers (
              id, inspection_id, section_id, question_id, question_type,
              answer_value, answer_text, answer_number, answer_boolean, notes
            )
            VALUES (
              ${answerId},
              ${inspectionId},
              ${question.sectionId},
              ${questionId},
              ${questionType},
              ${rawValue},
              ${rawValue},
              ${answerNumber},
              ${answerBoolean},
              ${comment || null}
            )
            ON CONFLICT (inspection_id, question_id) DO UPDATE SET
              answer_value = EXCLUDED.answer_value,
              answer_text = EXCLUDED.answer_text,
              answer_number = EXCLUDED.answer_number,
              answer_boolean = EXCLUDED.answer_boolean,
              notes = EXCLUDED.notes,
              updated_at = CURRENT_TIMESTAMP
          `
        }
    } catch (answersErr) {
      console.warn('[Inspections] Could not persist inspection answers to Postgres:', answersErr.message)
    }

    // Store photos in inspection_photos for PDF/noticeboard pipeline
    try {
      for (const [questionId, answer] of Object.entries(answers)) {
          if (answer === undefined || answer === null) continue
          const extras = answer_extras[questionId] || {}
          const urls = Array.isArray(extras.photo_urls)
            ? extras.photo_urls.filter((u) => typeof u === 'string' && u)
            : Array.isArray(extras.photoUrls)
              ? extras.photoUrls.filter((u) => typeof u === 'string' && u)
              : []
          const singleUrl = typeof extras.photoUrl === 'string' && extras.photoUrl.trim() ? extras.photoUrl.trim() : null
          const allUrls = singleUrl ? [singleUrl, ...urls] : urls
          for (let i = 0; i < allUrls.length; i++) {
            const url = allUrls[i]
            const photoId = `photo_${inspectionId}_${questionId}_${Date.now()}_${i}`
            await sql`
              INSERT INTO inspection_photos (id, inspection_id, question_id, blob_url, blob_key, filename)
              VALUES (${photoId}, ${inspectionId}, ${questionId}, ${url}, null, null)
            `
          }
      }
    } catch (photoErr) {
      console.warn('[Inspections] Could not store photos for PDF pipeline:', photoErr.message)
    }

    const actionsForPoster = []

    for (const section of template.sections || []) {
      for (const q of section.questions || []) {
        const answer = answers[q.id]
        if (answer === undefined || answer === null) continue
        const extras = answer_extras[q.id] || {}
        const comment = typeof extras.comment === 'string' ? extras.comment.trim() : ''
        const photoUrlsArr = Array.isArray(extras.photo_urls)
          ? extras.photo_urls.filter((u) => typeof u === 'string' && u)
          : Array.isArray(extras.photoUrls)
            ? extras.photoUrls.filter((u) => typeof u === 'string' && u)
            : []
        const photoUrlSingle = typeof extras.photoUrl === 'string' && extras.photoUrl.trim() ? extras.photoUrl.trim() : null
        const allPhotoUrls = photoUrlSingle ? [photoUrlSingle, ...photoUrlsArr] : photoUrlsArr

        const isNo = String(answer).toLowerCase() === 'no'
        const isIssue = isNo || (String(answer).toLowerCase() === 'yes' && comment)
        const residentMessage = comment || q.question_text || 'Issue raised from inspection'
        const category = q.action_category || q.category || 'Follow-up'

        if (isNo && q.create_action_on_no) {
          try {
            const actionId = `action_${inspectionId}_${q.id}_${Date.now()}`
            await sql`
              INSERT INTO actions (
                id, inspection_id, section_id, section_name, question_id,
                category, priority, title, description, location, status,
                comment, auto_created, photo_urls
              )
              VALUES (
                ${actionId}, ${inspectionId}, ${section.id}, ${section.title}, ${q.id},
                ${category}, null, ${residentMessage}, ${residentMessage}, null, 'open',
                ${comment || null}, true, ${JSON.stringify(allPhotoUrls)}
              )
            `
            actionsForPoster.push({
              id: actionId,
              category,
              title: residentMessage,
              description: residentMessage,
              comment: comment || null,
              photo_urls: allPhotoUrls,
              created_at: new Date(),
            })
          } catch (pgErr) {
            console.warn('[Inspections] Could not create Postgres action for poster:', pgErr.message)
          }
        }

        if (isIssue && q.triggers_task) {
          try {
            const taskId = `task_${inspectionId}_${q.id}_${Date.now()}`
            await sql`
              INSERT INTO tasks (id, inspection_id, question_id, category, issue_type, programme_tag, description, status)
              VALUES (${taskId}, ${inspectionId}, ${q.id}, ${q.category || category}, ${q.issue_type || null}, ${q.programme_tag || null}, ${residentMessage}, 'open')
            `
          } catch (taskErr) {
            console.warn('[Inspections] Could not create task:', taskErr.message)
          }
        }

        if (isIssue && q.triggers_email) {
          try {
            const emailTo = q.email_routing || inspectorEmail || ''
            const emailId = `email_${inspectionId}_${q.id}_${Date.now()}`
            await sql`
              INSERT INTO outbound_emails (id, inspection_id, question_id, email_to, email_routing, status)
              VALUES (${emailId}, ${inspectionId}, ${q.id}, ${emailTo}, ${q.email_routing || null}, 'pending')
            `
            if (emailTo) {
              await sql`UPDATE outbound_emails SET sent_at = CURRENT_TIMESTAMP, status = 'sent' WHERE id = ${emailId}`
            }
          } catch (emailErr) {
            console.warn('[Inspections] Could not log outbound email:', emailErr.message)
          }
        }
      }
    }

    let fullPdfUrl = null
    let posterPdfUrl = null
    try {
      const pdfSections = []
      const pdfPhotos = []

      for (const section of template.sections || []) {
        const sectionQuestions = []

        for (const question of section.questions || []) {
          const answer = answers[question.id]
          if (answer === undefined || answer === null) continue

          const extras = answer_extras[question.id] || {}
          const comment = typeof extras.comment === 'string' ? extras.comment.trim() : ''

          const photoUrlsArr = Array.isArray(extras.photo_urls)
            ? extras.photo_urls.filter((u) => typeof u === 'string' && u)
            : Array.isArray(extras.photoUrls)
              ? extras.photoUrls.filter((u) => typeof u === 'string' && u)
              : []
          const photoUrlSingle = typeof extras.photoUrl === 'string' && extras.photoUrl.trim() ? extras.photoUrl.trim() : null
          const allPhotoUrls = photoUrlSingle ? [photoUrlSingle, ...photoUrlsArr] : photoUrlsArr

          allPhotoUrls.forEach((url) => {
            pdfPhotos.push({
              url,
              linkedQuestionId: question.id,
              caption: comment || undefined,
            })
          })

          const isNo = String(answer).toLowerCase() === 'no'
          const actionCreated = isNo && question.create_action_on_no

          sectionQuestions.push({
            id: question.id,
            text: question.question_text || question.label || '',
            answer: String(answer),
            comment: comment || undefined,
            grade: question.grading_scheme_name ? String(answer) : undefined,
            actionCreated,
          })
        }

        if (sectionQuestions.length > 0) {
          pdfSections.push({
            title: section.title || section.name || 'Section',
            questions: sectionQuestions,
          })
        }
      }

      const pdfData = {
        inspectionId,
        templateName: template.name || 'Template',
        blockName: (typeof title === 'string' && title.trim()) || location?.trim() || 'Block',
        completedAt: new Date().toISOString(),
        officerName: inspectorName || 'Officer',
        sections: pdfSections,
        photos: pdfPhotos,
      }

      const fullPdfBytes = await buildInspectionReportPdf(pdfData)
      fullPdfUrl = await uploadInspectionPdfToBlob({
        inspectionId,
        pdfBytes: fullPdfBytes,
        kind: 'report',
      })

      const inspectionForPoster = {
        id: inspectionId,
        title: displayTitle,
        location_label: location || null,
        submitted_at: new Date(),
        inspector_name: inspectorName || '',
      }
      const posterPdfBytes = await generatePosterPdfBuffer(inspectionForPoster, actionsForPoster)
      posterPdfUrl = await uploadInspectionPdfToBlob({
        inspectionId,
        pdfBytes: posterPdfBytes,
        kind: 'poster',
      })

      await sql`
        UPDATE inspections 
        SET pdf_url = ${fullPdfUrl}, full_pdf_url = ${fullPdfUrl}, poster_pdf_url = ${posterPdfUrl}
        WHERE id = ${inspectionId}
      `
    } catch (pdfErr) {
      console.error('[Inspections] Error generating PDFs:', pdfErr)
    }

    return NextResponse.json({
      inspectionId,
      id: inspectionId,
      pdfUrl: fullPdfUrl || undefined,
      fullPdfUrl: fullPdfUrl || undefined,
      posterPdfUrl: posterPdfUrl || undefined,
    }, { status: 201 })
  } catch (error) {
    console.error('Error creating inspection:', error)
    return NextResponse.json(
      { error: 'Failed to create inspection', details: error.message },
      { status: 500 }
    )
  }
}
