import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '@/lib/db'
import { getAppAdminAccess } from '@/lib/app-admin-access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const FREQUENCIES = new Set(['weekly'])

async function requireAdmin() {
  const access = await getAppAdminAccess()
  if (!access.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!access.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!getPgUrl()) return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  await ensureDatabase()
  return null
}

function normalizeDayOfWeek(value) {
  const n = Number(value)
  if (!Number.isInteger(n) || n < 0 || n > 6) return null
  return n
}

function normalizeFrequency(value) {
  const v = String(value || 'weekly').trim().toLowerCase()
  return FREQUENCIES.has(v) ? v : null
}

export async function GET() {
  const err = await requireAdmin()
  if (err) return err

  try {
    const result = await sql`
      SELECT
        cs.*,
        p.name AS caretaker_name,
        p.email AS caretaker_email,
        u.email AS caretaker_user_email,
        e.name AS estate_name,
        b.name AS block_name
      FROM caretaker_schedules cs
      LEFT JOIN people p ON p.id = cs.caretaker_person_id
      LEFT JOIN users u ON u.id = cs.caretaker_user_id
      LEFT JOIN estates e ON e.id = cs.estate_id
      LEFT JOIN blocks b ON b.id = cs.block_id
      ORDER BY cs.active DESC, cs.day_of_week ASC, LOWER(COALESCE(p.name, u.email, ''))
    `
    return NextResponse.json(result.rows)
  } catch (e) {
    console.error('[admin/caretaker-schedules] GET:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request) {
  const err = await requireAdmin()
  if (err) return err

  try {
    const body = await request.json().catch(() => ({}))
    const caretakerPersonId = body.caretaker_person_id && String(body.caretaker_person_id).trim()
      ? String(body.caretaker_person_id).trim()
      : null
    const caretakerUserId = body.caretaker_user_id && String(body.caretaker_user_id).trim()
      ? String(body.caretaker_user_id).trim()
      : null
    if (!caretakerPersonId && !caretakerUserId) {
      return NextResponse.json({ error: 'caretaker_person_id or caretaker_user_id is required' }, { status: 400 })
    }

    if (caretakerPersonId) {
      const person = await sql`
        SELECT id, job_title FROM people WHERE id = ${caretakerPersonId} LIMIT 1
      `
      const p = person.rows[0]
      const label = String(p?.job_title || '').toLowerCase()
      if (!p || !label.includes('caretaker')) {
        return NextResponse.json({ error: 'Recurring schedules can only be assigned to caretakers' }, { status: 400 })
      }
    }

    const estateId = body.estate_id && String(body.estate_id).trim() ? String(body.estate_id).trim() : null
    const blockId = body.block_id && String(body.block_id).trim() ? String(body.block_id).trim() : null
    if (!estateId && !blockId) return NextResponse.json({ error: 'estate_id or block_id is required' }, { status: 400 })

    const templateId = body.template_id && String(body.template_id).trim() ? String(body.template_id).trim() : null
    const templateName = body.template_name && String(body.template_name).trim() ? String(body.template_name).trim() : null
    if (!templateId && !templateName) {
      return NextResponse.json({ error: 'template_id or template_name is required' }, { status: 400 })
    }

    const dayOfWeek = normalizeDayOfWeek(body.day_of_week)
    if (dayOfWeek == null) return NextResponse.json({ error: 'day_of_week must be 0-6' }, { status: 400 })
    const frequency = normalizeFrequency(body.frequency)
    if (!frequency) return NextResponse.json({ error: 'frequency must be weekly' }, { status: 400 })

    const id = `cs_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`
    const active = body.active !== false
    await sql`
      INSERT INTO caretaker_schedules (
        id, caretaker_user_id, caretaker_person_id, estate_id, block_id,
        template_id, template_name, day_of_week, frequency, active
      )
      VALUES (
        ${id}, ${caretakerUserId}, ${caretakerPersonId}, ${estateId}, ${blockId},
        ${templateId}, ${templateName}, ${dayOfWeek}, ${frequency}, ${active}
      )
    `
    const row = (await sql`
      SELECT * FROM caretaker_schedules WHERE id = ${id} LIMIT 1
    `).rows[0]
    return NextResponse.json(row, { status: 201 })
  } catch (e) {
    console.error('[admin/caretaker-schedules] POST:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
