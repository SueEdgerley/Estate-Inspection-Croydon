import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { sql } from '@vercel/postgres'
import { getPgUrl } from '@/lib/db'
import { isAdmin } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function requireAdmin() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const admin = await isAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!getPgUrl()) return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
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
    if (body.starts_at !== undefined) {
      updates.push(`starts_at = $${n++}`)
      values.push(new Date(body.starts_at).toISOString())
    }
    if (body.ends_at !== undefined) {
      updates.push(`ends_at = $${n++}`)
      values.push(body.ends_at == null ? null : new Date(body.ends_at).toISOString())
    }
    if (body.role !== undefined) {
      updates.push(`role = $${n++}`)
      values.push(String(body.role))
    }
    if (body.estate_id !== undefined) {
      updates.push(`estate_id = $${n++}`)
      values.push(body.estate_id && String(body.estate_id).trim() ? String(body.estate_id).trim() : null)
    }
    if (body.block_id !== undefined) {
      updates.push(`block_id = $${n++}`)
      values.push(body.block_id && String(body.block_id).trim() ? String(body.block_id).trim() : null)
    }
    if (updates.length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    values.push(id)
    await sql.query(
      `UPDATE user_assignments SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${n}`,
      values
    )
    const row = (await sql`SELECT * FROM user_assignments WHERE id = ${id}`).rows[0]
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(row)
  } catch (e) {
    console.error('Admin assignments PATCH:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(request, { params }) {
  const err = await requireAdmin()
  if (err) return err
  const id = params?.id
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  try {
    const result = await sql`DELETE FROM user_assignments WHERE id = ${id} RETURNING id`
    if (result.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ deleted: id })
  } catch (e) {
    console.error('Admin assignments DELETE:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
