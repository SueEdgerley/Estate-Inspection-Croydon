import { NextResponse } from 'next/server'
import { parse } from 'csv-parse/sync'
import { Pool } from 'pg'
import { getConnectionString, ensureDatabase } from '@/lib/db'
import { getAppAdminAccess } from '@/lib/app-admin-access'

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

/** Parse date/datetime string to ISO or null. */
function parseDateTime(str) {
  if (str == null || String(str).trim() === '') return null
  const d = new Date(String(str).trim())
  return isNaN(d.getTime()) ? null : d.toISOString()
}

/** Parse to YYYY-MM-DD for DATE columns. */
function parseDate(str) {
  if (str == null || String(str).trim() === '') return null
  const d = new Date(String(str).trim())
  if (isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

export async function POST(req) {
  try {
    const access = await getAppAdminAccess()
    if (!access.ok) {
      const status = !access.userId ? 401 : 403
      return NextResponse.json({ error: access.reason === 'no_database' ? 'Database not configured' : 'Forbidden' }, { status })
    }

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

    await ensureDatabase()
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

      // Sync into completed_inspections and inspections so dashboard shows the data
      let syncedToCompleted = 0
      let syncedToInspections = 0
      for (const r of records) {
        const id = toInt(r['Id'])
        if (id == null) continue
        const templateName = r['Template Name'] ?? null
        const location = r['Location'] ?? null
        const inspectorName = r['Inspector Name'] ?? null
        const inspectorEmail = r['Inspector Email'] ?? null
        const dueDate = parseDate(r['Due Date'])
        const completedAt = parseDateTime(r['Completed DateTime'] ?? r['Completed Date'] ?? r['Inspection DateTime'])
        const actualScore = toInt(r['Actual Score'])
        const totalScore = toInt(r['Total Possible Score'])
        const isAdHoc = toInt(r['Is Ad-Hoc']) === 1
        const isCompleted = toInt(r['Is Completed']) !== 0

        await client.query(
          `INSERT INTO completed_inspections (
            photobook_id, template_name, location_text, inspector_name, inspector_email,
            due_date, completed_at, actual_score, total_possible_score, is_ad_hoc, is_completed
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (photobook_id) DO UPDATE SET
            template_name = EXCLUDED.template_name,
            location_text = EXCLUDED.location_text,
            inspector_name = EXCLUDED.inspector_name,
            inspector_email = EXCLUDED.inspector_email,
            due_date = EXCLUDED.due_date,
            completed_at = EXCLUDED.completed_at,
            actual_score = EXCLUDED.actual_score,
            total_possible_score = EXCLUDED.total_possible_score,
            is_ad_hoc = EXCLUDED.is_ad_hoc,
            is_completed = EXCLUDED.is_completed`,
          [id, templateName, location, inspectorName, inspectorEmail, dueDate, completedAt, actualScore, totalScore, isAdHoc, isCompleted]
        )
        syncedToCompleted++

        const inspectionId = `photobook-${id}`
        const status = sourceStatus === 'completed' || sourceStatus === 'missed' ? 'submitted' : 'draft'
        const isScheduled = sourceStatus === 'scheduled' || (sourceStatus === 'completed' && !isAdHoc)
        const submittedAt = sourceStatus === 'completed' || sourceStatus === 'missed' ? (completedAt || new Date().toISOString()) : null

        await client.query(
          `INSERT INTO inspections (
            id, legacy_inspection_id, type, location_label, inspector_name, inspector_id,
            template_name, due_date, submitted_at, status, is_scheduled, work_type, created_at, updated_at
          ) VALUES ($1, $2, 'estate_walkabout', $3, $4, $5, $6, $7, $8, $9, $10, $11, COALESCE($8, NOW()), COALESCE($8, NOW()))
          ON CONFLICT (id) DO UPDATE SET
            legacy_inspection_id = EXCLUDED.legacy_inspection_id,
            location_label = EXCLUDED.location_label,
            inspector_name = EXCLUDED.inspector_name,
            inspector_id = EXCLUDED.inspector_id,
            template_name = EXCLUDED.template_name,
            due_date = EXCLUDED.due_date,
            submitted_at = EXCLUDED.submitted_at,
            status = EXCLUDED.status,
            is_scheduled = EXCLUDED.is_scheduled,
            work_type = EXCLUDED.work_type,
            updated_at = EXCLUDED.updated_at`,
          [
            inspectionId,
            id,
            location,
            inspectorName,
            inspectorEmail,
            templateName,
            dueDate,
            submittedAt,
            status,
            isScheduled,
            isScheduled ? 'caretaker_scheduled' : 'housing_walkabout',
          ]
        )
        syncedToInspections++
      }

      await client.query('COMMIT')
      return NextResponse.json({
        ok: true,
        inserted,
        status: sourceStatus,
        syncedToCompleted,
        syncedToInspections,
      })
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
