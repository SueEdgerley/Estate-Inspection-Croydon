import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { sql } from '@vercel/postgres'
import { getPgUrl } from '../../../../../lib/db'
import { isAdmin } from '../../../../../lib/auth'

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

    if (body.code !== undefined) {
      const code = String(body.code || '').trim()
      if (!code) return NextResponse.json({ error: 'code cannot be empty' }, { status: 400 })
      updates.push(`code = $${n++}`)
      values.push(code)
    }
    if (body.description !== undefined) {
      updates.push(`description = $${n++}`)
      values.push(body.description ? String(body.description).trim() : null)
    }
    if (body.category !== undefined) {
      updates.push(`category = $${n++}`)
      values.push(body.category ? String(body.category).trim() : null)
    }
    if (typeof body.active === 'boolean') {
      updates.push(`active = $${n++}`)
      values.push(body.active)
    }
    if (updates.length === 0) {
      return NextResponse.json({ error: 'Provide code/description/category/active' }, { status: 400 })
    }

    values.push(id)
    await sql.query(
      `UPDATE cost_codes SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${n}`,
      values
    )
    const row = (await sql`SELECT id, code, description, category, active FROM cost_codes WHERE id = ${id}`).rows[0]
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(row)
  } catch (e) {
    console.error('Admin cost-codes PATCH:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
