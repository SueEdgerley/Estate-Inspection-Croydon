import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '@/lib/db'
import { getAppAdminAccess } from '@/lib/app-admin-access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function requireAdmin() {
  const access = await getAppAdminAccess()
  if (!access.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!access.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!getPgUrl()) return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  await ensureDatabase()
  return null
}

function toIsoDate(value) {
  const d = value ? new Date(value) : new Date()
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

export async function POST(request) {
  const err = await requireAdmin()
  if (err) return err

  try {
    const body = await request.json().catch(() => ({}))
    const dueDate = toIsoDate(body.due_date)
    if (!dueDate) return NextResponse.json({ error: 'Invalid due_date' }, { status: 400 })
    const dayOfWeek = new Date(`${dueDate}T12:00:00Z`).getUTCDay()

    const schedules = await sql`
      SELECT
        cs.*,
        p.name AS caretaker_name,
        p.email AS caretaker_email,
        u.email AS caretaker_user_email,
        COALESCE(NULLIF(CONCAT_WS(' / ', e.name, b.name), ''), e.name, b.name) AS location_label
      FROM caretaker_schedules cs
      LEFT JOIN people p ON p.id = cs.caretaker_person_id
      LEFT JOIN users u ON u.id = cs.caretaker_user_id
      LEFT JOIN estates e ON e.id = cs.estate_id
      LEFT JOIN blocks b ON b.id = cs.block_id
      WHERE cs.active = true
        AND cs.frequency = 'weekly'
        AND cs.day_of_week = ${dayOfWeek}
    `

    let created = 0
    let skipped = 0
    for (const schedule of schedules.rows) {
      const occurrenceId = `${schedule.id}:${dueDate}`
      const existing = await sql`
        SELECT id FROM inspections WHERE scheduled_id = ${occurrenceId} LIMIT 1
      `
      if (existing.rows[0]) {
        skipped++
        continue
      }

      const inspectionId = `sched_${crypto.randomUUID().replace(/-/g, '').slice(0, 18)}`
      const title = [
        schedule.template_name || 'Caretaker scheduled task',
        schedule.location_label,
        dueDate,
      ].filter(Boolean).join(' - ')
      const inspectorId = schedule.caretaker_email || schedule.caretaker_user_email || null
      const inspectorName = schedule.caretaker_name || schedule.caretaker_user_email || null

      await sql`
        INSERT INTO inspections (
          id, legacy_inspection_id, type, title, location_label, due_date,
          template_id, template_name, status, submitted_at, created_at, updated_at,
          inspector_id, inspector_name, estate_id, block_id, scheduled_id, is_scheduled,
          source, work_type
        )
        VALUES (
          ${inspectionId}, NULL, 'inspection', ${title}, ${schedule.location_label || null}, ${dueDate},
          ${schedule.template_id || null}, ${schedule.template_name || null}, 'draft', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
          ${inspectorId}, ${inspectorName}, ${schedule.estate_id || null}, ${schedule.block_id || null}, ${occurrenceId}, true,
          'caretaker_schedule', 'caretaker_scheduled'
        )
        ON CONFLICT (id) DO NOTHING
      `
      created++
    }

    return NextResponse.json({ ok: true, dueDate, dayOfWeek, created, skipped })
  } catch (e) {
    console.error('[admin/caretaker-schedules/generate] POST:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
