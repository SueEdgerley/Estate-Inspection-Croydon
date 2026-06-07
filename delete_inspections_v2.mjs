#!/usr/bin/env node

import pg from 'pg'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const { Pool } = pg

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

async function execDb(sql, values = []) {
  const client = await pool.connect()
  try {
    const result = await client.query(sql, values)
    return result
  } finally {
    client.release()
  }
}

async function main() {
  try {
    console.log('🔍 INSPECTION DELETION SCRIPT')
    console.log('='.repeat(90) + '\n')
    console.log('📋 STEP 1: RESOLVE SHORT IDs TO FULL IDs\n')

    const shortIds = ['d2bcf449', 'd4dc71a5']
    const fullInspectionIds = {}

    for (const shortId of shortIds) {
      console.log(`Looking for inspection with short ID: ${shortId}`)
      
      const inspections = await queryDb(`
        SELECT id, location_label, title, template_name, inspector_name, submitted_at
        FROM inspections
        WHERE id LIKE $1
        LIMIT 5
      `, [`${shortId}%`])

      if (inspections.length === 0) {
        console.log(`  ❌ No inspection found with short ID ${shortId}`)
      } else if (inspections.length > 1) {
        console.log(`  ⚠️  Multiple inspections found with short ID ${shortId}`)
      } else {
        const insp = inspections[0]
        fullInspectionIds[shortId] = insp.id
        console.log(`  ✓ Found: ${insp.id}`)
        console.log(`    Inspector: ${insp.inspector_name}`)
        console.log(`    Submitted: ${insp.submitted_at}`)
      }
    }

    console.log(`\n📋 STEP 2: VERIFY INSPECTION DETAILS MATCH\n`)

    const expectedDetails = [
      {
        shortId: 'd2bcf449',
        blockName: 'Alford Green 1-27',
        type: 'Estate Walkabout',
        inspector: 'Natalia Hall',
        date: '02/06/2026'
      },
      {
        shortId: 'd4dc71a5',
        blockName: 'Academy Gardens 1-61',
        type: 'Estate Walkabout',
        inspector: 'Sue Edgerley',
        date: '02/06/2026'
      }
    ]

    let allMatch = true

    for (const expected of expectedDetails) {
      const fullId = fullInspectionIds[expected.shortId]
      if (!fullId) {
        console.log(`❌ SHORT ID ${expected.shortId}: Not found in database`)
        allMatch = false
        continue
      }

      const insp = await queryDb(`
        SELECT i.title, i.template_name, i.inspector_name, i.submitted_at, i.block_id,
               b.name as block_name
        FROM inspections i
        LEFT JOIN blocks b ON b.id = i.block_id
        WHERE i.id = $1
      `, [fullId])

      if (insp.length === 0) {
        console.log(`❌ FULL ID ${fullId}: Not found`)
        allMatch = false
        continue
      }

      const i = insp[0]
      const blockName = i.block_name || ''
      const template = i.template_name || ''
      const inspector = i.inspector_name || ''
      const submitted = i.submitted_at ? new Date(i.submitted_at).toLocaleDateString('en-GB') : ''

      console.log(`Inspection ${expected.shortId}:`)
      console.log(`  ✓ Block: ${blockName}`)
      console.log(`  ✓ Type: ${template}`)
      console.log(`  ✓ Inspector: ${inspector}`)
      console.log(`  ✓ Date: ${submitted}\n`)

      if (blockName !== expected.blockName ||
          !template.toLowerCase().includes('walkabout') ||
          inspector.toLowerCase() !== expected.inspector.toLowerCase() ||
          submitted !== expected.date) {
        allMatch = false
        console.log(`  ⚠️  MISMATCH - will not delete this inspection`)
      }
    }

    if (!allMatch) {
      console.log(`\n❌ Not all inspections matched. Aborting deletion.`)
      await pool.end()
      process.exit(1)
    }

    console.log(`✓ All inspection details verified - ready to delete\n`)

    console.log(`📋 STEP 3: COUNT LINKED RECORDS\n`)

    for (const shortId of shortIds) {
      const fullId = fullInspectionIds[shortId]
      if (!fullId) continue

      const actionCount = await queryDb(`SELECT COUNT(*) as cnt FROM actions WHERE inspection_id = $1`, [fullId])
      const answerCount = await queryDb(`SELECT COUNT(*) as cnt FROM inspection_answers WHERE inspection_id = $1`, [fullId])
      const photoCount = await queryDb(`SELECT COUNT(*) as cnt FROM inspection_photos WHERE inspection_id = $1`, [fullId])
      const recipientCount = await queryDb(`SELECT COUNT(*) as cnt FROM inspection_recipients WHERE inspection_id = $1`, [fullId])
      const updateCount = await queryDb(`SELECT COUNT(*) as cnt FROM inspection_updates WHERE inspection_id = $1`, [fullId])

      console.log(`Inspection ${shortId} (${fullId.substring(0, 12)}...):`)
      console.log(`  Actions/Issues: ${actionCount[0].cnt}`)
      console.log(`  Answers: ${answerCount[0].cnt}`)
      console.log(`  Photos: ${photoCount[0].cnt}`)
      console.log(`  Recipients: ${recipientCount[0].cnt}`)
      console.log(`  Updates: ${updateCount[0].cnt}\n`)
    }

    console.log(`📋 STEP 4: DELETE LINKED RECORDS\n`)

    for (const shortId of shortIds) {
      const fullId = fullInspectionIds[shortId]
      if (!fullId) continue

      console.log(`Deleting records for ${shortId}...`)

      try {
        // Delete in order of dependencies
        await execDb(`DELETE FROM action_photos WHERE action_id IN (SELECT id FROM actions WHERE inspection_id = $1)`, [fullId])
        console.log(`  ✓ Deleted action_photos`)

        await execDb(`DELETE FROM actions WHERE inspection_id = $1`, [fullId])
        console.log(`  ✓ Deleted actions`)

        await execDb(`DELETE FROM inspection_photos WHERE inspection_id = $1`, [fullId])
        console.log(`  ✓ Deleted inspection_photos`)

        await execDb(`DELETE FROM inspection_answers WHERE inspection_id = $1`, [fullId])
        console.log(`  ✓ Deleted inspection_answers`)

        await execDb(`DELETE FROM inspection_recipients WHERE inspection_id = $1`, [fullId])
        console.log(`  ✓ Deleted inspection_recipients`)

        await execDb(`DELETE FROM inspection_updates WHERE inspection_id = $1`, [fullId])
        console.log(`  ✓ Deleted inspection_updates`)

        // Delete the inspection itself
        await execDb(`DELETE FROM inspections WHERE id = $1`, [fullId])
        console.log(`  ✓ Deleted inspection record\n`)
      } catch (err) {
        console.error(`  ❌ Error deleting ${shortId}: ${err.message}\n`)
      }
    }

    console.log(`📋 STEP 5: VERIFY DELETION\n`)

    for (const shortId of shortIds) {
      const fullId = fullInspectionIds[shortId]
      if (!fullId) continue

      const remaining = await queryDb(`SELECT id FROM inspections WHERE id = $1`, [fullId])

      if (remaining.length === 0) {
        console.log(`✓ ${shortId}: CONFIRMED DELETED`)
        console.log(`  Full ID: ${fullId}\n`)
      } else {
        console.log(`❌ ${shortId}: Still exists in database!\n`)
      }
    }

    // Check that they no longer appear in listings
    console.log(`Checking Manage Inspections listing...`)
    const deletedIds = Object.values(fullInspectionIds).filter(id => id)
    const recent = await queryDb(`
      SELECT id, location_label, title, inspector_name, submitted_at
      FROM inspections
      WHERE submitted_at IS NOT NULL
      ORDER BY submitted_at DESC
      LIMIT 30
    `)

    const foundDeleted = recent.filter(r => deletedIds.includes(r.id))

    if (foundDeleted.length === 0) {
      console.log(`✓ Deleted inspections no longer appear in Manage Inspections\n`)
    } else {
      console.log(`❌ Deleted inspections still appear:`)
      for (const r of foundDeleted) {
        console.log(`  - ${r.location_label || r.title}`)
      }
    }

    console.log(`\n${'='.repeat(90)}`)
    console.log('✓ DELETION COMPLETE')
    console.log('='.repeat(90))

  } catch (error) {
    console.error('ERROR:', error.message)
    console.error(error.stack)
  } finally {
    await pool.end()
  }
}

main()
