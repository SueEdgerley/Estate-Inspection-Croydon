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

export async function PATCH(request, { params }) {
  const err = await requireAdmin()
  if (err) return err
  const id = params?.id
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  try {
    const body = await request.json().catch(() => ({}))
    const updates = []
    const values = []
    let n = 1

    for (const field of ['estate_id', 'block_id', 'template_id', 'template_name', 'frequency']) {
      if (body[field] !== undefined) {
        updates.push(`${field} = $${n++}`)
        values.push(body[field] && String(body[field]).trim() ? String(body[field]).trim() : null)
      }
    }
    if (body.day_of_week !== undefined) {
      const day = Number(body.day_of_week)
      if (!Number.isInteger(day) || day < 0 || day > 6) {
        return NextResponse.json({ error: 'day_of_week must be 0-6' }, { status: 400 })
      }
      updates.push(`day_of_week = $${n++}`)
      values.push(day)
    }
    if (body.active !== undefined) {
      updates.push(`active = $${n++}`)
      values.push(body.active === true)
    }

    if (updates.length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    values.push(id)
    await sql.query(
      `UPDATE caretaker_schedules SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${n}`,
      values
    )
    const row = (await sql`SELECT * FROM caretaker_schedules WHERE id = ${id} LIMIT 1`).rows[0]
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(row)
  } catch (e) {
    console.error('[admin/caretaker-schedules] PATCH:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(_request, { params }) {
  const err = await requireAdmin()
  if (err) return err
  const id = params?.id
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  try {
    const result = await sql`DELETE FROM caretaker_schedules WHERE id = ${id} RETURNING id`
    if (result.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ deleted: id })
  } catch (e) {
    console.error('[admin/caretaker-schedules] DELETE:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
