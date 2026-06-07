#!/usr/bin/env node

import pg from 'pg'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const { Pool } = pg

// Load .env.local
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const envPath = path.join(__dirname, '.env.local')

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8')
  for (const line of envContent.split('\n')) {
    if (line.startsWith('#') || !line.includes('=')) continue
    const [key, ...valueParts] = line.split('=')
    const value = valueParts.join('=').replace(/^["']|["']$/g, '')
    if (key && value) {
      process.env[key] = value
    }
  }
}

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL

if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL not set')
  process.exit(1)
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

async function queryDb(sql, values = []) {
  const client = await pool.connect()
  try {
    const result = await client.query(sql, values)
    return result.rows
  } finally {
    client.release()
  }
}

let inspectionColumnsCache = null
async function getInspectionColumns() {
  if (inspectionColumnsCache) return inspectionColumnsCache
  const rows = await queryDb(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'inspections'
      AND table_schema = 'public'
  `)
  inspectionColumnsCache = new Set(rows.map((r) => r.column_name))
  return inspectionColumnsCache
}

function getFieldValue(row, names, fallback = '(none)') {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(row, name) && row[name] != null) {
      return row[name]
    }
  }
  return fallback
}

async function resolveInspectionId(shortId) {
  if (!shortId) return null
  if (shortId.length === 36 && /^[0-9a-f-]+$/.test(shortId)) return shortId

  const rows = await queryDb(`
    SELECT id
    FROM inspections
    WHERE id::text LIKE $1
    LIMIT 2
  `, [`${shortId}%`])

  if (rows.length === 0) return null
  if (rows.length > 1) {
    console.warn(`⚠️ Multiple inspections match prefix ${shortId}; using first match: ${rows[0].id}`)
  }
  return rows[0].id
}

function buildQuestionTextMap(templateVersion) {
  const map = {}
  if (!templateVersion || typeof templateVersion !== 'object') return map

  const walkQuestions = (questions) => {
    if (!Array.isArray(questions)) return
    for (const q of questions) {
      if (!q || typeof q !== 'object') continue
      if (q.id) {
        map[q.id] = String(q.question_text || q.label || q.resident_wording || q.name || q.id || '')
      }
      if (Array.isArray(q.questions)) walkQuestions(q.questions)
      if (Array.isArray(q.steps)) walkQuestions(q.steps)
    }
  }

  const sections = Array.isArray(templateVersion.sections) ? templateVersion.sections : []
  for (const sec of sections) {
    if (!sec || typeof sec !== 'object') continue
    walkQuestions(sec.questions)
    walkQuestions(sec.steps)
  }
  return map
}

function parseStructuredNotes(notes) {
  if (!notes || typeof notes !== 'string') return { comment: null, photo_urls: [], paper_form_photo_urls: [] }
  if (!notes.startsWith('__NV_JSON__V1__')) {
    return { comment: notes.trim() || null, photo_urls: [], paper_form_photo_urls: [] }
  }

  try {
    const structured = JSON.parse(notes.slice('__NV_JSON__V1__'.length))
    return {
      comment: String(structured.comment || '').trim() || null,
      photo_urls: Array.isArray(structured.photo_urls) ? structured.photo_urls.filter(Boolean) : [],
      paper_form_photo_urls: Array.isArray(structured.paper_form_photo_urls) ? structured.paper_form_photo_urls.filter(Boolean) : [],
      raw: structured,
    }
  } catch (error) {
    return { comment: null, photo_urls: [], paper_form_photo_urls: [], parseError: error.message }
  }
}

async function analyzeInspection(inspectionId, label) {
  console.log(`\n${'='.repeat(90)}`)
  console.log(`INSPECTION: ${label} - SEARCH: ${inspectionId}`)
  console.log('='.repeat(90))

  const resolvedId = await resolveInspectionId(inspectionId)
  if (!resolvedId) {
    console.log(`❌ Inspection not found for search term: ${inspectionId}`)
    return
  }
  if (resolvedId !== inspectionId) {
    console.log(`🔎 Resolved short ID ${inspectionId} -> ${resolvedId}`)
  }

  const availableColumns = await getInspectionColumns()
  const inspectionFields = [
    'id', 'location_label', 'title', 'submitted_at', 'inspector_name',
    'inspector_id', 'template_name', 'type', 'block_id', 'block_name',
    'status', 'pdf_url', 'full_pdf_url', 'poster_pdf_url',
    'pdf_generation_error', 'template_version'
  ].filter((col) => availableColumns.has(col))

  const inspRows = await queryDb(`
    SELECT ${inspectionFields.join(', ')}
    FROM inspections
    WHERE id = $1
  `, [resolvedId])

  if (inspRows.length === 0) {
    console.log(`❌ Inspection not found for ID: ${resolvedId}`)
    return
  }

  const inspection = { ...inspRows[0] }
  if (typeof inspection.template_version === 'string') {
    try {
      inspection.template_version = JSON.parse(inspection.template_version)
    } catch {
      inspection.template_version = null
    }
  }

  const questionTextMap = buildQuestionTextMap(inspection.template_version)
  const pdfUrl = inspection.full_pdf_url || inspection.pdf_url || null

  console.log(`\n📋 Inspection Details:`)
  console.log(`   ID: ${inspection.id}`)
  console.log(`   Template: ${inspection.template_name}`)
  console.log(`   Status: ${inspection.status}`)
  console.log(`   Submitted: ${inspection.submitted_at}`)
  console.log(`   Block ID: ${getFieldValue(inspection, ['block_id'])}`)
  console.log(`   Location: ${getFieldValue(inspection, ['block_name', 'location_label', 'title'])}`)
  console.log(`   Inspector: ${inspection.inspector_name}`)
  console.log(`   PDF URL: ${pdfUrl || '(none)'}
`)

  const photoRecords = await queryDb(`
    SELECT question_id, blob_url, blob_key, filename, uploaded_at
    FROM inspection_photos
    WHERE inspection_id = $1
    ORDER BY question_id, uploaded_at
  `, [inspection.id])

  const photosByQuestion = {}
  for (const p of photoRecords) {
    photosByQuestion[p.question_id] = photosByQuestion[p.question_id] || []
    photosByQuestion[p.question_id].push(p)
  }

  const answers = await queryDb(`
    SELECT id, question_id, section_id, question_type, answer_value, answer_text, answer_number, answer_boolean, notes
    FROM inspection_answers
    WHERE inspection_id = $1
    ORDER BY question_id
  `, [inspection.id])

  console.log(`\n${'─'.repeat(90)}`)
  console.log('ANSWERS + COMMENTS + PHOTO URLS')
  console.log('─'.repeat(90))
  console.log(`Total answers: ${answers.length}`)

  const pdfSearchTerms = new Set()
  let totalQuestionsWithPhotos = 0
  let totalQuestionsWithComments = 0

  for (const ans of answers) {
    const qText = questionTextMap[ans.question_id] || `Question ${ans.question_id}`
    const notesInfo = parseStructuredNotes(ans.notes)
    const photoUrls = notesInfo.photo_urls || []
    const commentText = notesInfo.comment || null
    const photosForQuestion = photosByQuestion[ans.question_id] || []

    if (commentText) totalQuestionsWithComments += 1
    if (photoUrls.length > 0 || photosForQuestion.length > 0) totalQuestionsWithPhotos += 1

    console.log(`\nQ: ${ans.question_id}`)
    console.log(`   Question Text: ${qText}`)
    console.log(`   Answer Value: ${ans.answer_value ?? '(none)'}`)
    console.log(`   Answer Text: ${ans.answer_text ?? '(none)'}`)
    console.log(`   Answer Number: ${ans.answer_number ?? '(none)'}`)
    console.log(`   Answer Boolean: ${ans.answer_boolean ?? '(none)'}`)

    if (commentText) {
      console.log(`   Comment: ${commentText}`)
      pdfSearchTerms.add(commentText)
    } else {
      console.log(`   Comment: (none)`)
    }

    if (photoUrls.length > 0) {
      console.log(`   Photo URLs in notes: ${photoUrls.length}`)
      for (const url of photoUrls) {
        console.log(`     - ${url}`)
        pdfSearchTerms.add(url)
      }
    }

    if (photosForQuestion.length > 0) {
      console.log(`   Photo records: ${photosForQuestion.length}`)
      for (const p of photosForQuestion) {
        console.log(`     - ${p.blob_url}`)
        if (p.blob_url) pdfSearchTerms.add(p.blob_url)
      }
    } else if (photoUrls.length === 0) {
      console.log(`   Photo records: 0`)
    }

    if (notesInfo.parseError) {
      console.log(`   ⚠️ Notes parse error: ${notesInfo.parseError}`)
    }
    if (notesInfo.paper_form_photo_urls && notesInfo.paper_form_photo_urls.length > 0) {
      console.log(`   Paper form photo URLs: ${notesInfo.paper_form_photo_urls.length}`)
      for (const url of notesInfo.paper_form_photo_urls) {
        console.log(`     - ${url}`)
        pdfSearchTerms.add(url)
      }
    }
  }

  const unansweredPhotoQuestions = Object.entries(photosByQuestion)
    .filter(([qid, photos]) => !answers.some((ans) => ans.question_id === qid))

  if (unansweredPhotoQuestions.length > 0) {
    console.log(`\n${'─'.repeat(90)}`)
    console.log('PHOTO RECORDS WITHOUT A MATCHING ANSWER QUESTION')
    console.log('─'.repeat(90))
    for (const [qid, photos] of unansweredPhotoQuestions) {
      console.log(`Q: ${qid} has ${photos.length} photo record(s) but no inspection_answers row`) 
    }
  }

  console.log(`\nSummary: ${totalQuestionsWithComments} answer(s) with comments, ${totalQuestionsWithPhotos} question(s) with photo data`)

  console.log(`\n${'─'.repeat(90)}`)
  console.log('PDF CHECK')
  console.log('─'.repeat(90))

  if (!pdfUrl) {
    console.log('❌ No PDF URL available for this inspection')
  } else {
    const check = await fetchPdfIncludes(pdfUrl, Array.from(pdfSearchTerms).slice(0, 100))
    if (!check.ok) {
      console.log(`❌ Could not fetch PDF: ${check.error}`)
    } else {
      console.log(`PDF search terms: ${Object.keys(check.matches).length}`)
      let foundCount = 0
      for (const [term, found] of Object.entries(check.matches)) {
        console.log(`   ${found ? '✓' : '✗'} ${term}`)
        if (found) foundCount += 1
      }
      console.log(`\nPDF inclusion: ${foundCount}/${Object.keys(check.matches).length} terms found`)
    }
  }

  console.log(`\n`)
}

async function fetchPdfIncludes(fullPdfUrl, terms = []) {
  if (!fullPdfUrl) return { ok: false, error: 'no-pdf-url', matches: {} }
  try {
    const res = await fetch(fullPdfUrl, { method: 'GET' })
    if (!res.ok) return { ok: false, error: `fetch-status-${res.status}`, matches: {} }
    const buf = await res.arrayBuffer()
    // Convert to string to search for plaintext terms (URLs/comments may appear)
    const text = Buffer.from(buf).toString('utf8')
    const matches = {}
    for (const t of terms) {
      matches[t] = text.includes(t)
    }
    return { ok: true, matches }
  } catch (e) {
    return { ok: false, error: e.message, matches: {} }
  }
}

async function main() {
  try {
    console.log('🔍 INVESTIGATION: MISSING INSPECTION PHOTOS & COMMENTS')
    console.log('Estate Inspection System - Croydon')

    // Inspection 1: Stanley Road 35-39B (short ID prefix)
    await analyzeInspection('01f2e192', 'STANLEY ROAD 35-39B')

    // Explicit fallback for the exact full ID
    await analyzeInspection('01f2e192-f275-4fb2-a9cc-6d510b48738d', 'STANLEY ROAD 35-39B FULL ID')

    // Find Launceston Court - search for it
    console.log(`\n${'='.repeat(90)}`)
    console.log('SEARCHING FOR: Launceston Court 5-10')
    console.log('='.repeat(90))

    const availableColumns = await getInspectionColumns()
    const launcestonSelect = [
      'id', 'template_name', 'submitted_at', 'inspector_name', 'status',
      'pdf_url', 'full_pdf_url'
    ].filter((col) => availableColumns.has(col))

    const locationConditions = []
    const locationValues = []
    if (availableColumns.has('location_label')) {
      locationConditions.push(`LOWER(COALESCE(location_label, '')) LIKE $${locationValues.length + 1}`)
      locationValues.push('%launceston%')
    }
    if (availableColumns.has('title')) {
      locationConditions.push(`LOWER(COALESCE(title, '')) LIKE $${locationValues.length + 1}`)
      locationValues.push('%launceston%')
    }

    let launceston = []
    if (locationConditions.length > 0) {
      launceston = await queryDb(`
        SELECT ${launcestonSelect.join(', ')}
        FROM inspections
        WHERE ${locationConditions.join(' OR ')}
        ORDER BY submitted_at DESC
        LIMIT 10
      `, locationValues)
    } else {
      console.log('⚠️ Cannot search Launceston Court by location because location fields are missing')
    }

    if (launceston.length === 0) {
      console.log(`❌ No Launceston Court inspections found`)
    } else {
      console.log(`\nFound ${launceston.length} Launceston Court inspection(s):\n`)
      for (const insp of launceston) {
        console.log(`- ID: ${insp.id}`)
        console.log(`  Template: ${getFieldValue(insp, ['template_name'])}`)
        console.log(`  Submitted: ${getFieldValue(insp, ['submitted_at'])}`)
        console.log(`  Block ID: ${getFieldValue(insp, ['block_id'])}`)
        console.log(`  Location: ${getFieldValue(insp, ['block_name', 'location_label', 'title'])}`)
        console.log(`  Status: ${getFieldValue(insp, ['status'])}`)
        console.log(`  PDF URL: ${getFieldValue(insp, ['full_pdf_url', 'pdf_url'])}\n`)
      }
    }

    console.log(`\n${'='.repeat(90)}`)
    console.log('SEARCHING FOR: Recent inspections by Paul Brazill')
    console.log('='.repeat(90))

    const paulAvailableColumns = await getInspectionColumns()
    const paulSelect = [
      'id', 'template_name', 'submitted_at', 'inspector_name', 'status',
      'pdf_url', 'full_pdf_url', 'block_id', 'block_name', 'location_label', 'title'
    ].filter((col) => paulAvailableColumns.has(col))

    let paulRecent = []
    if (paulAvailableColumns.has('inspector_name')) {
      paulRecent = await queryDb(`
        SELECT ${paulSelect.join(', ')}
        FROM inspections
        WHERE LOWER(inspector_name) LIKE $1
        ORDER BY submitted_at DESC
        LIMIT 5
      `, ['%paul%'])
    } else {
      console.log('⚠️ Cannot search Paul Brazill inspections because inspector_name column is missing')
    }

    if (paulRecent.length === 0) {
      console.log('❌ No recent inspections found for Paul Brazill')
    } else {
      console.log(`\nFound ${paulRecent.length} recent inspections by Paul Brazill:\n`)
      for (const insp of paulRecent) {
        console.log(`- ID: ${insp.id}`)
        console.log(`  Template: ${getFieldValue(insp, ['template_name'])}`)
        console.log(`  Submitted: ${getFieldValue(insp, ['submitted_at'])}`)
        console.log(`  Block ID: ${getFieldValue(insp, ['block_id'])}`)
        console.log(`  Location: ${getFieldValue(insp, ['block_name', 'location_label', 'title'])}`)
        console.log(`  Status: ${getFieldValue(insp, ['status'])}`)
        console.log(`  PDF URL: ${getFieldValue(insp, ['full_pdf_url', 'pdf_url'])}\n`)
      }

      for (const insp of paulRecent) {
        await analyzeInspection(insp.id, `PAUL BRAZILL INSPECTION ${insp.id}`)
      }
    }

    console.log('\n' + '='.repeat(90))
    console.log('Investigation complete')
    console.log('='.repeat(90))

  } catch (error) {
    console.error('ERROR:', error.message)
    console.error(error.stack)
  } finally {
    await pool.end()
  }
}

main()
