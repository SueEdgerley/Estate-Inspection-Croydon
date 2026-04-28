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
    for (const field of ['title', 'template_id', 'template_key', 'template_name']) {
      if (body[field] !== undefined) {
        updates.push(`${field} = $${n++}`)
        const s = String(body[field] || '').trim()
        values.push(s || null)
      }
    }
    if (body.active !== undefined) {
      updates.push(`active = $${n++}`)
      values.push(body.active === true)
    }
    if (updates.length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 })

    values.push(id)
    await sql.query(
      `UPDATE best_practice_guides SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${n}`,
      values
    )
    const row = (await sql`
      SELECT id, template_id, template_key, template_name, title, file_url, file_key,
        content_type, active, created_by, created_at, updated_at
      FROM best_practice_guides
      WHERE id = ${id}
      LIMIT 1
    `).rows[0]
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(row)
  } catch (e) {
    console.error('[admin/best-practice-guides] PATCH:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
