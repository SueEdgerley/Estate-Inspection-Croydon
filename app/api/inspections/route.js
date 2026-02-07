import { NextResponse } from 'next/server'
import { getTemplatesNested, createAirtableRecord, TABLES } from '@/lib/airtable-client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request) {
  const hasKey = process.env.AIRTABLE_API_TOKEN || process.env.AIRTABLE_API_KEY
  if (!process.env.AIRTABLE_BASE_ID || !hasKey) {
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

    const questionsById = new Map()
    template.sections.forEach((sec) => {
      (sec.questions || []).forEach((q) => questionsById.set(q.id, { ...q, sectionId: sec.id }))
    })

    try {
      for (const [questionId, answer] of Object.entries(answers)) {
        if (answer === undefined || answer === null) continue
        const question = questionsById.get(questionId)
        if (!question) continue
        await createAirtableRecord(TABLES.INSPECTION_RESPONSES, {
          Inspection: [inspectionId],
          Question: [questionId],
          Answer: String(answer),
        })
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
        const photoUrls = Array.isArray(extras.photoUrls) ? extras.photoUrls.filter((u) => typeof u === 'string' && u) : []

        const residentMessage = comment || q.question_text || 'Issue raised from inspection'
        const category = q.action_category || 'Follow-up'

        const actionFields = {
          Inspection: [inspectionId],
          'Action Category': category,
          Status: 'Open',
          Description: residentMessage,
          'Resident Message': residentMessage,
        }
        if (photoUrls.length > 0) {
          actionFields.Photos = photoUrls.map((url) => ({ url }))
        }

        try {
          await createAirtableRecord(TABLES.ACTIONS, actionFields)
        } catch (actionErr) {
          console.warn('[Inspections] Actions/Issues table may not exist or have different fields:', actionErr.message)
        }
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
