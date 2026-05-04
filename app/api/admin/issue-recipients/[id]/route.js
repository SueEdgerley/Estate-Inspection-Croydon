import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '@/lib/db'
import { getAppAdminAccess } from '@/lib/app-admin-access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CATEGORY = 'issue_recipient'

async function requireAdmin() {
  const access = await getAppAdminAccess()
  if (!access.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!access.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!getPgUrl()) return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  return null
}

export async function PATCH(request, { params }) {
  const err = await requireAdmin()
  if (err) return err
  const { id } = await params
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  try {
    await ensureDatabase()
    const cur = await sql`
      SELECT id, name, email, active FROM people WHERE id = ${id} AND category = ${CATEGORY} LIMIT 1
    `
    if (!cur.rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const body = await request.json().catch(() => ({}))
    let name = cur.rows[0].name
    let email = cur.rows[0].email
    if (body.name !== undefined) {
      const n = String(body.name).trim()
      if (!n) return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 })
      name = n
    }
    if (body.email !== undefined) {
      const em = String(body.email).trim()
      if (!em) return NextResponse.json({ error: 'email cannot be empty' }, { status: 400 })
      const clash = await sql`
        SELECT id FROM people WHERE lower(trim(email)) = lower(trim(${em})) AND id IS DISTINCT FROM ${id} LIMIT 1
      `
      if (clash.rows[0]) {
        return NextResponse.json({ error: 'Another record already uses this email' }, { status: 409 })
      }
      email = em
    }
    if (body.name === undefined && body.email === undefined) {
      return NextResponse.json({ error: 'Provide name and/or email' }, { status: 400 })
    }
    await sql`
      UPDATE people SET name = ${name}, email = ${email}, updated_at = CURRENT_TIMESTAMP WHERE id = ${id}
    `
    const row = (await sql`SELECT id, name, email, active FROM people WHERE id = ${id}`).rows[0]
    return NextResponse.json(row)
  } catch (e) {
    console.error('issue-recipients PATCH:', e)
    if (e?.code === '23505') {
      return NextResponse.json({ error: 'Email already in use' }, { status: 409 })
    }
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(request, { params }) {
  const err = await requireAdmin()
  if (err) return err
  const { id } = await params
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  try {
    await ensureDatabase()
    const del = await sql`
      UPDATE people
      SET active = false, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id} AND category = ${CATEGORY}
      RETURNING id
    `
    if (del.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ ok: true, id: del.rows[0].id, active: false })
  } catch (e) {
    console.error('issue-recipients DELETE:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
