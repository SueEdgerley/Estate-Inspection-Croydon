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

async function main() {
  try {
    console.log('🔍 INSPECTING LOCATION DATA FOR TARGET INSPECTIONS\n')

    const inspectionIds = [
      'd2bcf449-1cd4-48b1-b112-7e9df308726e',
      'd4dc71a5-181a-431c-b53d-d635ad28e364'
    ]

    for (const id of inspectionIds) {
      const result = await queryDb(`
        SELECT 
          id, 
          location_label,
          title,
          estate_id,
          block_id,
          inspector_name,
          template_name,
          submitted_at
        FROM inspections 
        WHERE id = $1
      `, [id])

      if (result.length === 0) {
        console.log(`Inspection ${id}: NOT FOUND`)
        continue
      }

      const i = result[0]
      console.log(`Inspection: ${id.substring(0, 12)}...`)
      console.log(`  location_label: "${i.location_label}"`)
      console.log(`  title: "${i.title}"`)
      console.log(`  estate_id: ${i.estate_id}`)
      console.log(`  block_id: ${i.block_id}`)
      console.log(`  inspector_name: ${i.inspector_name}`)
      console.log(`  template_name: ${i.template_name}`)
      console.log(`  submitted_at: ${i.submitted_at}\n`)

      // Get the block name
      if (i.block_id) {
        const block = await queryDb(`
          SELECT name FROM blocks WHERE id = $1
        `, [i.block_id])
        if (block.length > 0) {
          console.log(`  Block name: ${block[0].name}\n`)
        }
      }

      // Get the estate name
      if (i.estate_id) {
        const estate = await queryDb(`
          SELECT name FROM estates WHERE id = $1
        `, [i.estate_id])
        if (estate.length > 0) {
          console.log(`  Estate name: ${estate[0].name}\n`)
        }
      }
    }

  } catch (error) {
    console.error('ERROR:', error.message)
  } finally {
    await pool.end()
  }
}

main()
