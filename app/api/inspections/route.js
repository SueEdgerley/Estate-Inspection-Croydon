import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase } from '@/lib/db'
import { getTemplatesNested, createAirtableRecord, updateAirtableRecord, getPeopleByEmail, TABLES } from '@/lib/airtable-client'
import { getAuth, getCurrentUserEmail, getCurrentUserName, isAdmin } from '@/lib/auth'
import { getOrCreateAirtableUser } from '@/lib/get-or-create-airtable-user'
import { buildInspectionReportPdf } from '@/lib/pdf/buildInspectionReportPdf'
import { uploadInspectionPdfToBlob } from '@/lib/blob/uploadPdf'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const { userId } = await getAuth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    await ensureDatabase()
    if (!process.env.POSTGRES_URL) {
      return NextResponse.json(
        { error: 'Database not configured' },
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
  const { userId } = await getAuth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  console.log('Clerk userId:', userId)

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

  const { template_id, title, location, description, answers = {}, answer_extras = {} } = body

  if (!template_id || !title || typeof title !== 'string' || !title.trim()) {
    return NextResponse.json(
      { error: 'template_id and title are required' },
      { status: 400 }
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

    // Get or create Airtable Users record for current Clerk user; link inspection to it
    let airtableUserRecordId = null
    try {
      airtableUserRecordId = await getOrCreateAirtableUser()
    } catch (userErr) {
      console.error('Airtable error:', userErr)
      console.error('Airtable error JSON:', userErr?.error ?? userErr)
      console.warn('[Inspections] Could not get/create Airtable User (ensure Users table has Clerk User ID):', userErr?.message ?? userErr)
    }
    console.log('Airtable user record:', airtableUserRecordId)

    const inspectionFields = {
      Title: title.trim(),
      Template: [template_id],
      Status: 'Draft',
    }
    if (airtableUserRecordId) inspectionFields.User = [airtableUserRecordId]
    if (location && String(location).trim()) inspectionFields.Location = String(location).trim()
    if (description && String(description).trim()) inspectionFields.Description = String(description).trim()

    let airtableRecordId
    try {
      airtableRecordId = await createAirtableRecord(TABLES.INSPECTIONS, inspectionFields)
    } catch (createErr) {
      console.error('Airtable error:', createErr)
      console.error('Airtable error JSON:', createErr?.error ?? createErr)
      if (inspectionFields.User && (createErr?.message || '').toLowerCase().includes('airtable')) {
        delete inspectionFields.User
        try {
          airtableRecordId = await createAirtableRecord(TABLES.INSPECTIONS, inspectionFields)
        } catch (retryErr) {
          console.error('Airtable error (retry):', retryErr)
          console.error('Airtable error JSON (retry):', retryErr?.error ?? retryErr)
          throw createErr
        }
      } else {
        throw createErr
      }
    }

    // Link inspection to Person when submitted-by email matches exactly one Person (do not block on no match)
    if (inspectorEmail && inspectorEmail.trim()) {
      try {
        const people = await getPeopleByEmail(inspectorEmail.trim())
        if (people.length === 1) {
          await updateAirtableRecord(TABLES.INSPECTIONS, airtableRecordId, {
            'Submitted by person': [people[0].id],
          })
        } else if (people.length === 0) {
          console.warn('[Inspections] No Person found for submitted-by email:', inspectorEmail.trim())
        } else {
          console.warn('[Inspections] Multiple People match submitted-by email:', inspectorEmail.trim(), '- inspection not linked')
        }
      } catch (linkErr) {
        console.warn('[Inspections] Could not link inspection to Person by email:', linkErr.message)
      }
    }

    const questionsById = new Map()
    template.sections.forEach((sec) => {
      (sec.questions || []).forEach((q) => questionsById.set(q.id, { ...q, sectionId: sec.id }))
    })

    const responseField = process.env.AIRTABLE_RESPONSE_FIELD || 'Response'
    const photoField = process.env.AIRTABLE_PHOTO_FIELD || 'Photo'
    try {
      for (const [questionId, answer] of Object.entries(answers)) {
        if (answer === undefined || answer === null) continue
        const question = questionsById.get(questionId)
        if (!question) continue
        const extras = answer_extras[questionId] || {}
        const photoUrlsArr = Array.isArray(extras.photo_urls)
          ? extras.photo_urls.filter((u) => typeof u === 'string' && u)
          : Array.isArray(extras.photoUrls)
            ? extras.photoUrls.filter((u) => typeof u === 'string' && u)
            : []
        const photoUrlSingle = typeof extras.photoUrl === 'string' && extras.photoUrl.trim() ? extras.photoUrl.trim() : null
        const allPhotoUrls = photoUrlSingle ? [photoUrlSingle, ...photoUrlsArr] : photoUrlsArr

        const fields = {
          Inspection: [airtableRecordId],
          Question: [questionId],
          [responseField]: String(answer),
        }
        if (allPhotoUrls.length > 0) {
          fields[photoField] = allPhotoUrls.map((url) => ({ url }))
        }
        await createAirtableRecord(TABLES.INSPECTION_RESPONSES, fields)
      }
    } catch (responseErr) {
      console.warn('[Inspections] Inspection Responses table may not exist or have different fields:', responseErr.message)
    }

    // Store photos in inspection_photos for PDF/noticeboard pipeline
    if (process.env.POSTGRES_URL) {
      try {
        await ensureDatabase()
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
    }

    // Create Issue/Action records for "fail" answers (e.g. Yes/No = No when create_action_on_no)
    for (const section of template.sections || []) {
      for (const q of section.questions || []) {
        const answer = answers[q.id]
        const isNo = String(answer).toLowerCase() === 'no'
        if (!isNo || !q.create_action_on_no) continue

        const extras = answer_extras[q.id] || {}
        const comment = typeof extras.comment === 'string' ? extras.comment.trim() : ''
        const photoUrlsArr = Array.isArray(extras.photo_urls)
          ? extras.photo_urls.filter((u) => typeof u === 'string' && u)
          : Array.isArray(extras.photoUrls)
            ? extras.photoUrls.filter((u) => typeof u === 'string' && u)
            : []
        const photoUrlSingle = typeof extras.photoUrl === 'string' && extras.photoUrl.trim() ? extras.photoUrl.trim() : null
        const allPhotoUrls = photoUrlSingle ? [photoUrlSingle, ...photoUrlsArr] : photoUrlsArr

        const residentMessage = comment || q.question_text || 'Issue raised from inspection'
        const category = q.action_category || 'Follow-up'

        const actionFields = {
          Inspection: [airtableRecordId],
          'Action Category': category,
          Status: 'Open',
          Description: residentMessage,
          'Resident Message': residentMessage,
        }
        if (allPhotoUrls.length > 0) {
          actionFields.Photos = allPhotoUrls.map((url) => ({ url }))
        }

        try {
          await createAirtableRecord(TABLES.ACTIONS, actionFields)
        } catch (actionErr) {
          console.warn('[Inspections] Actions/Issues table may not exist or have different fields:', actionErr.message)
        }

        // Also create Postgres action for poster PDF (with photo_urls)
        if (process.env.POSTGRES_URL) {
          try {
            await ensureDatabase()
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
          } catch (pgErr) {
            console.warn('[Inspections] Could not create Postgres action for poster:', pgErr.message)
          }
        }
      }
    }

    // Also write to Postgres so the dashboard and app can see the inspection (linked to current user by email)
    let pdfUrl = null
    if (process.env.POSTGRES_URL) {
      try {
        await ensureDatabase()
        await sql`
          INSERT INTO inspections (
            id, legacy_inspection_id, type, title, description, location_label,
            template_id, template_name, status, submitted_at, created_at, updated_at,
            inspector_id, inspector_name
          )
          VALUES (
            ${inspectionId},
            NULL,
            'inspection',
            ${title.trim()},
            ${description && String(description).trim() ? String(description).trim() : null},
            ${location && String(location).trim() ? String(location).trim() : null},
            ${template_id},
            ${template.name || null},
            'submitted',
            new Date(),
            new Date(),
            new Date(),
            ${inspectorEmail || null},
            ${inspectorName || null}
          )
          ON CONFLICT (id) DO UPDATE SET
            title = EXCLUDED.title,
            description = EXCLUDED.description,
            location_label = EXCLUDED.location_label,
            template_id = EXCLUDED.template_id,
            template_name = EXCLUDED.template_name,
            status = EXCLUDED.status,
            submitted_at = EXCLUDED.submitted_at,
            inspector_id = COALESCE(EXCLUDED.inspector_id, inspections.inspector_id),
            inspector_name = COALESCE(EXCLUDED.inspector_name, inspections.inspector_name),
            updated_at = ${new Date()}
        `

        // Generate PDF and upload to Blob
        try {
          // Build PDF data structure from template, answers, and answer_extras
          const pdfSections = []
          const pdfPhotos = []

          for (const section of template.sections || []) {
            const sectionQuestions = []
            
            for (const question of section.questions || []) {
              const answer = answers[question.id]
              if (answer === undefined || answer === null) continue

              const extras = answer_extras[question.id] || {}
              const comment = typeof extras.comment === 'string' ? extras.comment.trim() : ''
              
              // Get photo URLs for this question
              const photoUrlsArr = Array.isArray(extras.photo_urls)
                ? extras.photo_urls.filter((u) => typeof u === 'string' && u)
                : Array.isArray(extras.photoUrls)
                  ? extras.photoUrls.filter((u) => typeof u === 'string' && u)
                  : []
              const photoUrlSingle = typeof extras.photoUrl === 'string' && extras.photoUrl.trim() ? extras.photoUrl.trim() : null
              const allPhotoUrls = photoUrlSingle ? [photoUrlSingle, ...photoUrlsArr] : photoUrlsArr

              // Add photos to PDF photos array
              allPhotoUrls.forEach((url) => {
                pdfPhotos.push({
                  url,
                  linkedQuestionId: question.id,
                  caption: comment || undefined,
                })
              })

              // Determine if action was created (for Yes/No questions answered "No")
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

          // Build PDF data
          const pdfData = {
            inspectionId,
            templateName: template.name || templateName || 'Template',
            blockName: title.trim() || location?.trim() || 'Block',
            completedAt: new Date().toISOString(),
            officerName: inspectorName || 'Officer',
            sections: pdfSections,
            photos: pdfPhotos,
          }

          // Generate PDF bytes
          const pdfBytes = await buildInspectionReportPdf(pdfData)

          // Upload to Vercel Blob
          pdfUrl = await uploadInspectionPdfToBlob({
            inspectionId,
            pdfBytes,
          })

          // Update Postgres inspection with PDF URL
          await sql`
            UPDATE inspections 
            SET pdf_url = ${pdfUrl}
            WHERE id = ${inspectionId}
          `

          // Update Airtable inspection with PDF URL (if field exists)
          try {
            await updateAirtableRecord(TABLES.INSPECTIONS, airtableRecordId, {
              'PDF URL': pdfUrl,
            })
          } catch (airtablePdfErr) {
            console.warn('[Inspections] Could not update Airtable PDF URL (field may not exist):', airtablePdfErr.message)
          }
        } catch (pdfErr) {
          console.error('[Inspections] Error generating PDF:', pdfErr)
          // Don't fail the whole request if PDF generation fails
        }
      } catch (dbErr) {
        console.warn('[Inspections] Could not save to database (dashboard may not show this inspection):', dbErr.message)
      }
    }

    return NextResponse.json({ 
      inspectionId, 
      id: inspectionId,
      pdfUrl: pdfUrl || undefined,
    }, { status: 201 })
  } catch (error) {
    console.error('Error creating inspection:', error)
    return NextResponse.json(
      { error: 'Failed to create inspection', details: error.message },
      { status: 500 }
    )
  }
}
