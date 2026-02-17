import { NextResponse } from 'next/server'
import { parse } from 'csv-parse/sync'
import { Pool } from 'pg'
import { getConnectionString } from '@/lib/db'

export const runtime = 'nodejs'

let pool = null
function getPool() {
  if (pool) return pool
  const connectionString = getConnectionString()
  if (!connectionString) {
    throw new Error('Missing database connection string')
  }
  pool = new Pool({
    connectionString,
    ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false },
  })
  return pool
}

function toInt(v) {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

export async function POST(req) {
  try {
    const url = new URL(req.url)
    const sourceStatus = url.searchParams.get('status') || 'completed'
    if (!['completed', 'missed', 'scheduled'].includes(sourceStatus)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Missing file field' }, { status: 400 })
    }

    const text = await file.text()
    const records = parse(text, {
      columns: true,
      skip_empty_lines: true,
      relax_quotes: true,
      relax_column_count: true,
      trim: true,
    })

    if (!Array.isArray(records) || records.length === 0) {
      return NextResponse.json({ error: 'CSV had no rows' }, { status: 400 })
    }

    const pool = getPool()
    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      await client.query(`
        ALTER TABLE photobook_import_raw
        ADD COLUMN IF NOT EXISTS source_status TEXT;
      `)

      const chunkSize = 300
      let inserted = 0

      for (let i = 0; i < records.length; i += chunkSize) {
        const chunk = records.slice(i, i + chunkSize)
        const values = []
        const rowsSql = []

        chunk.forEach((r, idx) => {
          const base = idx * 20
          values.push(
            toInt(r['Id']),
            r['Frequency'] ?? null,
            r['Template Name'] ?? null,
            r['Location'] ?? null,
            r['Band'] ?? null,
            toInt(r['Actual Score']),
            toInt(r['Total Possible Score']),
            r['Inspection Date'] ?? null,
            r['Inspection Time'] ?? null,
            r['Inspection DateTime'] ?? null,
            r['Due Date'] ?? null,
            r['Completed Date'] ?? null,
            r['Completed Time'] ?? null,
            r['Completed DateTime'] ?? null,
            r['Inspector Name'] ?? null,
            r['Inspector Email'] ?? null,
            r['Email To'] ?? null,
            toInt(r['Is Ad-Hoc']),
            toInt(r['Is Completed']),
            sourceStatus
          )
          rowsSql.push(
            `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, ` +
            `$${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}, $${base + 12}, $${base + 13}, $${base + 14}, ` +
            `$${base + 15}, $${base + 16}, $${base + 17}, $${base + 18}, $${base + 19}, $${base + 20})`
          )
        })

        const sql = `
          INSERT INTO photobook_import_raw (
            id, frequency, template_name, location, band, actual_score, total_possible_score,
            inspection_date, inspection_time, inspection_datetime, due_date,
            completed_date, completed_time, completed_datetime,
            inspector_name, inspector_email, email_to,
            is_ad_hoc, is_completed, source_status
          )
          VALUES ${rowsSql.join(', ')}
          ON CONFLICT (id) DO NOTHING
        `
        await client.query(sql, values)
        inserted += chunk.length
      }

      await client.query('COMMIT')
      return NextResponse.json({ ok: true, inserted, status: sourceStatus })
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {})
      return NextResponse.json(
        { error: 'Import failed', details: e?.message || String(e) },
        { status: 500 }
      )
    } finally {
      client.release()
    }
  } catch (e) {
    return NextResponse.json(
      { error: 'Import failed', details: e?.message || String(e) },
      { status: 500 }
    )
  }
}
