import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase } from '@/lib/db'
import { getTemplatesNested, createAirtableRecord, updateAirtableRecord, getPeopleByEmail, TABLES } from '@/lib/airtable-client'
import { getAuth, getCurrentUserEmail, getCurrentUserName } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request) {
  const { userId } = await getAuth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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

    const inspectionFields = {
      Title: title.trim(),
      Template: [template_id],
      Status: 'Draft',
    }
    if (location && String(location).trim()) inspectionFields.Location = String(location).trim()
    if (description && String(description).trim()) inspectionFields.Description = String(description).trim()

    const inspectionId = await createAirtableRecord(TABLES.INSPECTIONS, inspectionFields)

    // Link inspection to Person when submitted-by email matches exactly one Person (do not block on no match)
    if (inspectorEmail && inspectorEmail.trim()) {
      try {
        const people = await getPeopleByEmail(inspectorEmail.trim())
        if (people.length === 1) {
          await updateAirtableRecord(TABLES.INSPECTIONS, inspectionId, {
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
        const photoUrl = typeof extras.photoUrl === 'string' && extras.photoUrl.trim() ? extras.photoUrl.trim() : null
        const photoUrls = Array.isArray(extras.photoUrls) ? extras.photoUrls.filter((u) => typeof u === 'string' && u) : []
        const allPhotoUrls = photoUrl ? [photoUrl, ...photoUrls] : photoUrls

        const fields = {
          Inspection: [inspectionId],
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

    // Create Issue/Action records for "fail" answers (e.g. Yes/No = No when create_action_on_no)
    for (const section of template.sections || []) {
      for (const q of section.questions || []) {
        const answer = answers[q.id]
        const isNo = String(answer).toLowerCase() === 'no'
        if (!isNo || !q.create_action_on_no) continue

        const extras = answer_extras[q.id] || {}
        const comment = typeof extras.comment === 'string' ? extras.comment.trim() : ''
        const photoUrl = typeof extras.photoUrl === 'string' && extras.photoUrl.trim() ? extras.photoUrl.trim() : null
        const photoUrls = Array.isArray(extras.photoUrls) ? extras.photoUrls.filter((u) => typeof u === 'string' && u) : []
        const allPhotoUrls = photoUrl ? [photoUrl, ...photoUrls] : photoUrls

        const residentMessage = comment || q.question_text || 'Issue raised from inspection'
        const category = q.action_category || 'Follow-up'

        const actionFields = {
          Inspection: [inspectionId],
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
      }
    }

    // Also write to Postgres so the dashboard and app can see the inspection (linked to current user by email)
    if (process.env.POSTGRES_URL) {
      try {
        await ensureDatabase()
        await sql`
          INSERT INTO inspections (
            id, type, title, description, location_label,
            template_id, template_name, status, submitted_at, created_at, updated_at,
            inspector_id, inspector_name
          )
          VALUES (
            ${inspectionId},
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
      } catch (dbErr) {
        console.warn('[Inspections] Could not save to database (dashboard may not show this inspection):', dbErr.message)
      }
    }

    return NextResponse.json({ inspectionId, id: inspectionId }, { status: 201 })
  } catch (error) {
    console.error('Error creating inspection:', error)
    return NextResponse.json(
      { error: 'Failed to create inspection', details: error.message },
      { status: 500 }
    )
  }
}
