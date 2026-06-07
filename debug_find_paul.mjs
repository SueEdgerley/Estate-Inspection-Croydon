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

async function main() {
  try {
    console.log('🔍 SEARCHING FOR PAUL\'S INSPECTIONS\n')

    // Search for Paul's inspections
    const paulInspections = await queryDb(`
      SELECT 
        id,
        location_label,
        title,
        submitted_at,
        inspector_name,
        status,
        created_at
      FROM inspections
      WHERE LOWER(COALESCE(inspector_name, '')) LIKE '%paul%'
      ORDER BY created_at DESC
      LIMIT 50
    `)
    
    console.log(`Found ${paulInspections.length} inspections for Paul:\n`)
    for (const insp of paulInspections) {
      console.log(`- ${insp.location_label || insp.title || '(no location)'}`)
      console.log(`  ID: ${insp.id}`)
      console.log(`  Status: ${insp.status}`)
      console.log(`  Submitted: ${insp.submitted_at}`)
      console.log(`  Created: ${insp.created_at}`)
      console.log(`  Inspector: ${insp.inspector_name}\n`)
    }

    // Search for any inspection containing key words
    console.log('\n' + '='.repeat(80))
    console.log('🔍 SEARCHING FOR "STANLEY" OR "LAUNCESTON" ANYWHERE:\n')
    
    const keyword_search = await queryDb(`
      SELECT DISTINCT
        i.id,
        i.location_label,
        i.title,
        i.inspector_name,
        i.submitted_at
      FROM inspections i
      LEFT JOIN inspection_answers ia ON ia.inspection_id = i.id
      WHERE LOWER(COALESCE(i.location_label, '')) LIKE '%stanley%'
         OR LOWER(COALESCE(i.title, '')) LIKE '%stanley%'
         OR LOWER(COALESCE(i.location_label, '')) LIKE '%launceston%'
         OR LOWER(COALESCE(i.title, '')) LIKE '%launceston%'
         OR LOWER(COALESCE(ia.notes, '')) LIKE '%stanley%'
         OR LOWER(COALESCE(ia.notes, '')) LIKE '%launceston%'
      ORDER BY i.created_at DESC
    `)
    
    console.log(`Found ${keyword_search.length} inspections with Stanley/Launceston:\n`)
    for (const insp of keyword_search) {
      console.log(`- ${insp.location_label || insp.title}`)
      console.log(`  ID: ${insp.id}`)
      console.log(`  Inspector: ${insp.inspector_name}`)
      console.log(`  Submitted: ${insp.submitted_at}\n`)
    }

    if (paulInspections.length > 0) {
      // Analyze the most recent Paul inspection
      const newest = paulInspections[0]
      console.log('\n' + '='.repeat(80))
      console.log(`📊 DETAILED ANALYSIS OF MOST RECENT PAUL INSPECTION:\n`)
      console.log(`Location: ${newest.location_label || newest.title}`)
      console.log(`ID: ${newest.id}`)
      console.log(`Status: ${newest.status}`)
      console.log(`Submitted: ${newest.submitted_at}\n`)

      // Get answers for this inspection
      const answers = await queryDb(`
        SELECT 
          question_id,
          answer_value,
          notes,
          created_at
        FROM inspection_answers
        WHERE inspection_id = $1
        ORDER BY question_id
      `, [newest.id])

      console.log(`Answers: ${answers.length}`)
      for (const ans of answers) {
        if (ans.notes) {
          console.log(`\n  Q${ans.question_id}:`)
          console.log(`    Answer: ${ans.answer_value}`)
          
          if (ans.notes.startsWith('__NV_JSON__V1__')) {
            try {
              const data = JSON.parse(ans.notes.slice('__NV_JSON__V1__'.length))
              console.log(`    Structured: ${Object.keys(data).join(', ')}`)
              if (data.comment) console.log(`    Comment: "${data.comment.substring(0, 80)}"`)
              if (data.photo_urls) console.log(`    Photo URLs: ${data.photo_urls.length}`)
            } catch (e) {
              console.log(`    Notes (error parsing): ${ans.notes.substring(0, 80)}`)
            }
          } else {
            console.log(`    Notes: ${ans.notes.substring(0, 80)}`)
          }
        }
      }

      // Get photos for this inspection
      const photos = await queryDb(`
        SELECT question_id, blob_url, filename
        FROM inspection_photos
        WHERE inspection_id = $1
      `, [newest.id])

      console.log(`\n\nPhotos: ${photos.length}`)
      for (const photo of photos) {
        console.log(`  Q${photo.question_id}: ${photo.filename || photo.blob_url.substring(0, 40)}`)
      }
    }

  } catch (error) {
    console.error('ERROR:', error.message)
    console.error(error.stack)
  } finally {
    await pool.end()
  }
}

main()
