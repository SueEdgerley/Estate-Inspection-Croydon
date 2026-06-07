#!/usr/bin/env node

/**
 * Investigation script: Find inspections with missing photos/comments
 * Usage: node debug_inspection_photos.mjs
 */

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
  console.error('Available:', Object.keys(process.env).filter(k => k.includes('DATABASE') || k.includes('POSTGRES')))
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

async function investigateInspection(searchTerm) {
  console.log(`\n${'='.repeat(80)}`)
  console.log(`SEARCHING FOR: ${searchTerm}`)
  console.log('='.repeat(80))

  // Find inspection by location or title
  const inspections = await queryDb(`
    SELECT 
      id, 
      location_label, 
      title, 
      submitted_at, 
      inspector_name,
      type,
      template_name
    FROM inspections
    WHERE LOWER(location_label) LIKE LOWER($1) 
       OR LOWER(title) LIKE LOWER($1)
    ORDER BY submitted_at DESC
    LIMIT 5
  `, [`%${searchTerm}%`])

  if (inspections.length === 0) {
    console.log(`❌ No inspections found for "${searchTerm}"`)
    return
  }

  console.log(`\n✓ Found ${inspections.length} inspection(s)`)
  for (const i of inspections) {
    console.log(`  - ID: ${i.id}`)
    console.log(`    Location: ${i.location_label || i.title}`)
    console.log(`    Type: ${i.template_name}`)
    console.log(`    Submitted: ${i.submitted_at}`)
    console.log(`    Inspector: ${i.inspector_name}`)
  }

  // Use first/most recent
  const inspection = inspections[0]
  const inspectionId = inspection.id

  console.log(`\n📋 DETAILED ANALYSIS FOR: ${inspection.location_label || inspection.title}`)
  console.log(`   Inspection ID: ${inspectionId}`)
  console.log(`   Submitted: ${inspection.submitted_at}`)

  // ============ ANSWERS ============
  console.log(`\n${'─'.repeat(80)}`)
  console.log('INSPECTION ANSWERS:')
  console.log('─'.repeat(80))

  const answers = await queryDb(`
    SELECT 
      id,
      question_id,
      section_id,
      answer_value,
      answer_text,
      notes,
      created_at,
      updated_at
    FROM inspection_answers
    WHERE inspection_id = $1
    ORDER BY question_id
  `, [inspectionId])

  console.log(`Total answers: ${answers.length}`)

  for (const ans of answers) {
    const notes = ans.notes || ''
    const hasStructuredData = notes.startsWith('__NV_JSON__V1__')
    
    if (hasStructuredData || notes.trim()) {
      console.log(`\n  Q${ans.question_id}:`)
      console.log(`    Answer: ${ans.answer_value || ans.answer_text || '(empty)'}`)
      console.log(`    Has structured notes: ${hasStructuredData}`)
      
      if (notes) {
        try {
          if (hasStructuredData) {
            const structured = JSON.parse(notes.slice('__NV_JSON__V1__'.length))
            console.log(`    Structured data keys: ${Object.keys(structured).join(', ')}`)
            
            if (structured.comment) {
              console.log(`    ✓ Comment: "${structured.comment.substring(0, 100)}${structured.comment.length > 100 ? '...' : ''}"`)
            }
            
            if (structured.photo_urls && Array.isArray(structured.photo_urls)) {
              console.log(`    ✓ Photo URLs in notes: ${structured.photo_urls.length}`)
              for (const url of structured.photo_urls) {
                console.log(`      - ${url}`)
              }
            }
            
            if (structured.paper_form_photo_urls && Array.isArray(structured.paper_form_photo_urls)) {
              console.log(`    ✓ Paper form photos in notes: ${structured.paper_form_photo_urls.length}`)
              for (const url of structured.paper_form_photo_urls) {
                console.log(`      - ${url}`)
              }
            }
          } else {
            console.log(`    Plain text notes: "${notes.substring(0, 100)}${notes.length > 100 ? '...' : ''}"`)
          }
        } catch (e) {
          console.log(`    Notes (raw): ${notes.substring(0, 100)}...`)
        }
      }
    }
  }

  // ============ PHOTOS ============
  console.log(`\n${'─'.repeat(80)}`)
  console.log('INSPECTION_PHOTOS TABLE:')
  console.log('─'.repeat(80))

  const photos = await queryDb(`
    SELECT 
      id,
      question_id,
      blob_url,
      blob_key,
      filename,
      uploaded_at
    FROM inspection_photos
    WHERE inspection_id = $1
    ORDER BY question_id, uploaded_at
  `, [inspectionId])

  console.log(`Total photo records: ${photos.length}`)
  if (photos.length > 0) {
    const byQuestion = {}
    for (const p of photos) {
      if (!byQuestion[p.question_id]) byQuestion[p.question_id] = []
      byQuestion[p.question_id].push(p)
    }
    
    for (const [qid, photoList] of Object.entries(byQuestion)) {
      console.log(`\n  Q${qid}: ${photoList.length} photo(s)`)
      for (const p of photoList) {
        console.log(`    - URL: ${p.blob_url}`)
        console.log(`      Filename: ${p.filename || '(none)'}`)
        console.log(`      Uploaded: ${p.uploaded_at}`)
      }
    }
  }

  // ============ ACTIONS ============
  console.log(`\n${'─'.repeat(80)}`)
  console.log('ACTIONS (ISSUES):')
  console.log('─'.repeat(80))

  const actions = await queryDb(`
    SELECT 
      id,
      question_id,
      title,
      description,
      comment,
      photo_urls,
      status,
      created_at
    FROM actions
    WHERE inspection_id = $1
    ORDER BY created_at
  `, [inspectionId])

  console.log(`Total actions: ${actions.length}`)
  for (const act of actions) {
    console.log(`\n  ${act.title}`)
    console.log(`    Question: ${act.question_id}`)
    console.log(`    Status: ${act.status}`)
    
    if (act.comment) {
      console.log(`    ✓ Comment: "${act.comment.substring(0, 100)}"`)
    }
    
    if (act.photo_urls) {
      try {
        const urls = typeof act.photo_urls === 'string' 
          ? JSON.parse(act.photo_urls) 
          : act.photo_urls
        if (Array.isArray(urls) && urls.length > 0) {
          console.log(`    ✓ Photo URLs in action: ${urls.length}`)
          for (const url of urls) {
            console.log(`      - ${url}`)
          }
        }
      } catch (e) {
        console.log(`    photo_urls: ${act.photo_urls}`)
      }
    }
  }

  // ============ PDF RECORDS ============
  console.log(`\n${'─'.repeat(80)}`)
  console.log('PDF RECORDS:')
  console.log('─'.repeat(80))

  const pdfRecord = await queryDb(`
    SELECT 
      pdf_url,
      full_pdf_url,
      poster_pdf_url,
      pdf_generation_error
    FROM inspections
    WHERE id = $1
  `, [inspectionId])

  if (pdfRecord.length > 0) {
    const pdf = pdfRecord[0]
    console.log(`\n  Full PDF URL: ${pdf.full_pdf_url ? '✓ ' + pdf.full_pdf_url.substring(0, 60) + '...' : '❌ None'}`)
    console.log(`  Poster PDF URL: ${pdf.poster_pdf_url ? '✓ ' + pdf.poster_pdf_url.substring(0, 60) + '...' : '❌ None'}`)
    console.log(`  PDF Generation Error: ${pdf.pdf_generation_error ? '⚠️ ' + pdf.pdf_generation_error : 'None'}`)
  }

  console.log(`\n`)
}

async function main() {
  try {
    console.log('🔍 INSPECTION PHOTO/COMMENT INVESTIGATION')
    console.log('Estate Inspection System - Croydon\n')

    // First, list recent inspections
    console.log('📋 RECENT INSPECTIONS IN DATABASE:')
    console.log('─'.repeat(80))
    
    const recentInspections = await queryDb(`
      SELECT 
        id,
        location_label,
        title,
        submitted_at,
        inspector_name,
        type
      FROM inspections
      WHERE submitted_at IS NOT NULL
      ORDER BY submitted_at DESC
      LIMIT 20
    `)
    
    console.log(`Found ${recentInspections.length} submitted inspections:\n`)
    for (let i = 0; i < recentInspections.length; i++) {
      const insp = recentInspections[i]
      console.log(`${i + 1}. ${insp.location_label || insp.title || '(no location)'}`)
      console.log(`   ID: ${insp.id}`)
      console.log(`   Submitted: ${insp.submitted_at}`)
      console.log(`   Inspector: ${insp.inspector_name}`)
      console.log(`   Type: ${insp.type}\n`)
    }

    await investigateInspection('Stanley Road')
    await investigateInspection('Launceston Court')

    console.log('\n' + '='.repeat(80))
    console.log('Investigation complete')
    console.log('='.repeat(80))
  } catch (error) {
    console.error('ERROR:', error.message)
    console.error(error)
  } finally {
    await pool.end()
  }
}

main()
