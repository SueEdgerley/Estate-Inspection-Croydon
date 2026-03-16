import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { getPgUrl } from '@/lib/db'
import { getRouteAccess } from '@/lib/permissions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ROLES = ['caretaker', 'esm', 'housing officer', 'admin']

async function requireAdmin() {
  const { denialResponse } = await getRouteAccess({ requireAdmin: true })
  if (denialResponse) return denialResponse
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
    if (typeof body.active === 'boolean') {
      updates.push(`active = $${n++}`)
      values.push(body.active)
    }
    if (body.role !== undefined) {
      const role = ROLES.includes(String(body.role).toLowerCase()) ? String(body.role).toLowerCase() : null
      updates.push(`role = $${n++}`)
      values.push(role)
    }
    if (updates.length === 0) return NextResponse.json({ error: 'Provide active and/or role' }, { status: 400 })
    values.push(id)
    await sql.query(
      `UPDATE people SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${n}`,
      values
    )
    const row = (await sql`SELECT id, name, email, role, active FROM people WHERE id = ${id}`).rows[0]
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(row)
  } catch (e) {
    console.error('Admin users PATCH:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
