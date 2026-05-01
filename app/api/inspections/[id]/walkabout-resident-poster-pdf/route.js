import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '@/lib/db'
import { isEstateWalkaboutTemplateVersion } from '@/lib/estate-walkabout-template'
import { buildWalkaboutResidentPosterPdf } from '@/lib/pdf/buildWalkaboutResidentPosterPdf'
import { unpackNvWizardNotes } from '@/lib/nv-notes-pack'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function parseTemplateVersion(raw) {
  if (!raw) return null
  if (typeof raw === 'object') return raw
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw)
    } catch {
      return null
    }
  }
  return null
}

function parsePhotoUrls(raw) {
  if (Array.isArray(raw)) return raw.filter((url) => typeof url === 'string' && url.trim())
  if (typeof raw === 'string' && raw.trim()) {
    try {
      return parsePhotoUrls(JSON.parse(raw))
    } catch {
      return raw.startsWith('http') ? [raw] : []
    }
  }
  return []
}

function answerDisplay(row) {
  if (row?.answer_text != null && String(row.answer_text).trim()) return String(row.answer_text).trim()
  if (row?.answer_value != null && String(row.answer_value).trim()) return String(row.answer_value).trim()
  if (row?.answer_number != null) return String(row.answer_number)
  if (row?.answer_boolean === true) return 'Yes'
  if (row?.answer_boolean === false) return 'No'
  return ''
}

function buildQuestionLookup(templateVersion) {
  const questions = new Map()
  const sections = new Map()
  for (const section of templateVersion?.sections || []) {
    const sectionName = section.title || section.name || section.id || ''
    if (section.id) sections.set(String(section.id), sectionName)
    for (const question of section.questions || []) {
      if (!question?.id) continue
      questions.set(String(question.id), {
        section: sectionName,
        question: question.question_text || question.label || question.text || question.id,
      })
    }
  }
  return { questions, sections }
}

function mergePhotoUrls(...groups) {
  const seen = new Set()
  const urls = []
  for (const group of groups) {
    for (const url of parsePhotoUrls(group)) {
      if (seen.has(url)) continue
      seen.add(url)
      urls.push(url)
    }
  }
  return urls
}

function addOrMergeItem(itemsByKey, key, patch) {
  const existing = itemsByKey.get(key) || {}
  itemsByKey.set(key, {
    ...existing,
    ...patch,
    comment: patch.comment || existing.comment || '',
    description: patch.description || existing.description || '',
    location: patch.location || existing.location || '',
    status: patch.status || existing.status || 'Open',
    job_number: patch.job_number || existing.job_number || '',
    expected_completion_date: patch.expected_completion_date || existing.expected_completion_date || '',
    photo_urls: mergePhotoUrls(existing.photo_urls, patch.photo_urls),
    created_at: patch.created_at || existing.created_at || '',
    updated_at: patch.updated_at || existing.updated_at || '',
  })
}

async function generate(request, { params }) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (!getPgUrl()) return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
    await ensureDatabase()

    const { id } = await params
    const inspectionResult = await sql`
      SELECT
        i.*,
        COALESCE(NULLIF(CONCAT_WS(' / ', e.name, b.name), ''), i.location_label, i.title) AS estate_block_name
      FROM inspections i
      LEFT JOIN estates e ON e.id = i.estate_id
      LEFT JOIN blocks b ON b.id = i.block_id
      WHERE i.id = ${id}
      LIMIT 1
    `

    const inspection = inspectionResult.rows[0]
    if (!inspection) return NextResponse.json({ error: 'Inspection not found' }, { status: 404 })

    const templateVersion = parseTemplateVersion(inspection.template_version)
    const isWalkabout =
      isEstateWalkaboutTemplateVersion(templateVersion) ||
      String(inspection.type || '').toLowerCase() === 'estate_walkabout' ||
      String(inspection.template_name || '').toLowerCase().includes('walkabout')

    if (!isWalkabout) {
      return NextResponse.json({ error: 'Walkabout resident poster is only available for Walkabout inspections' }, { status: 400 })
    }

    const answersResult = await sql`
      SELECT id, inspection_id, section_id, question_id, question_type,
        answer_value, answer_text, answer_number, answer_boolean, notes
      FROM inspection_answers
      WHERE inspection_id = ${id}
      ORDER BY section_id ASC, question_id ASC
    `

    const photosResult = await sql`
      SELECT question_id, blob_url
      FROM inspection_photos
      WHERE inspection_id = ${id}
    `

    const actionsResult = await sql`
      SELECT
        id, inspection_id, section_id, section_name, question_id,
        category, title, description, location, status, comment,
        photo_urls, job_number, expected_completion_date, created_at, updated_at
      FROM actions
      WHERE inspection_id = ${id}
        AND auto_created = true
      ORDER BY section_name ASC, created_at ASC
    `

    const { questions, sections } = buildQuestionLookup(templateVersion)
    const photosByQuestion = new Map()
    for (const photo of photosResult.rows || []) {
      const questionId = String(photo.question_id || '')
      const url = String(photo.blob_url || '').trim()
      if (!questionId || !url) continue
      const list = photosByQuestion.get(questionId) || []
      list.push(url)
      photosByQuestion.set(questionId, list)
    }

    const actionsByQuestion = new Map()
    for (const action of actionsResult.rows || []) {
      const questionId = String(action.question_id || '')
      if (!questionId) continue
      const list = actionsByQuestion.get(questionId) || []
      list.push(action)
      actionsByQuestion.set(questionId, list)
    }

    const itemsByKey = new Map()
    for (const row of answersResult.rows || []) {
      const questionId = String(row.question_id || '')
      if (!questionId) continue
      const meta = questions.get(questionId) || {}
      const notes = unpackNvWizardNotes(row.notes)
      const structuredPhotos = [
        ...parsePhotoUrls(notes.structured?.photo_urls),
        ...parsePhotoUrls(notes.structured?.paper_form_photo_urls),
      ]
      const dbPhotos = photosByQuestion.get(questionId) || []
      const linkedActions = actionsByQuestion.get(questionId) || []
      const action = linkedActions[0] || null
      const actionPhotos = parsePhotoUrls(action?.photo_urls)
      const comment = notes.plainComment || (typeof notes.structured?.comment === 'string' ? notes.structured.comment.trim() : '')
      const hasPhoto = structuredPhotos.length > 0 || dbPhotos.length > 0 || actionPhotos.length > 0
      const hasAction = linkedActions.length > 0
      if (!comment && !hasPhoto && !hasAction) continue

      addOrMergeItem(itemsByKey, questionId, {
        section: meta.section || sections.get(String(row.section_id || '')) || action?.section_name || row.section_id || '',
        question: meta.question || action?.title || questionId,
        title: action?.title || meta.question || questionId,
        comment: comment || action?.comment || action?.description || answerDisplay(row),
        description: action?.description || '',
        location: action?.location || inspection.location_label || inspection.estate_block_name || '',
        status: action?.status || 'Open',
        job_number: action?.job_number || '',
        expected_completion_date: action?.expected_completion_date || '',
        photo_urls: [...structuredPhotos, ...dbPhotos, ...actionPhotos],
        created_at: action?.created_at || '',
        updated_at: action?.updated_at || '',
      })
    }

    for (const action of actionsResult.rows || []) {
      const questionId = String(action.question_id || action.id || '')
      if (!questionId) continue
      addOrMergeItem(itemsByKey, questionId, {
        section: action.section_name || questions.get(questionId)?.section || '',
        question: questions.get(questionId)?.question || action.title || questionId,
        title: action.title || questionId,
        comment: action.comment || action.description || action.title || '',
        description: action.description || '',
        location: action.location || inspection.location_label || inspection.estate_block_name || '',
        status: action.status || 'Open',
        job_number: action.job_number || '',
        expected_completion_date: action.expected_completion_date || '',
        photo_urls: action.photo_urls,
        created_at: action.created_at || '',
        updated_at: action.updated_at || '',
      })
    }

    const pdfBuffer = await buildWalkaboutResidentPosterPdf({
      inspection,
      items: [...itemsByKey.values()],
    })

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="walkabout-resident-poster-${String(id).slice(0, 12)}.pdf"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('[walkabout-resident-poster-pdf]', error)
    return NextResponse.json(
      { error: 'Walkabout resident poster PDF generation failed', details: error?.message || String(error) },
      { status: 500 }
    )
  }
}

export async function GET(request, context) {
  return generate(request, context)
}

export async function POST(request, context) {
  return generate(request, context)
}
