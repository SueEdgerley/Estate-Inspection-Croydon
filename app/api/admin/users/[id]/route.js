import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '@/lib/db'
import { getAppAdminAccess } from '@/lib/app-admin-access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ROLES = ['caretaker', 'esm', 'housing officer', 'admin']

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
  const id = params?.id
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  try {
    await ensureDatabase()
    const body = await request.json().catch(() => ({}))

    const cur = await sql`
      SELECT id, name, email, role, active, category FROM people WHERE id = ${id} LIMIT 1
    `
    const row0 = cur.rows[0]
    if (!row0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (row0.category === 'issue_recipient') {
      return NextResponse.json({ error: 'Use Issue Recipients to edit routing contacts' }, { status: 400 })
    }

    const touched =
      body.name !== undefined ||
      body.email !== undefined ||
      body.role !== undefined ||
      typeof body.active === 'boolean'
    if (!touched) {
      return NextResponse.json({ error: 'Provide name, email, role, and/or active' }, { status: 400 })
    }

    let name = row0.name
    let email = row0.email
    let role = row0.role
    let active = row0.active

    if (body.name !== undefined) {
      const n = String(body.name).trim()
      if (!n) return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 })
      name = n
    }
    if (body.email !== undefined) {
      const em = String(body.email).trim().toLowerCase()
      if (!em) return NextResponse.json({ error: 'email cannot be empty' }, { status: 400 })
      const clash = await sql`
        SELECT id FROM people WHERE lower(trim(email)) = ${em} AND id IS DISTINCT FROM ${id} LIMIT 1
      `
      if (clash.rows[0]) {
        return NextResponse.json({ error: 'Another person already uses this email' }, { status: 409 })
      }
      email = em
    }
    if (body.role !== undefined) {
      role = ROLES.includes(String(body.role).toLowerCase()) ? String(body.role).toLowerCase() : null
    }
    if (typeof body.active === 'boolean') {
      active = body.active
    }

    await sql`
      UPDATE people
      SET name = ${name}, email = ${email}, role = ${role}, active = ${active}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
    `

    const row = (await sql`SELECT id, name, email, role, active FROM people WHERE id = ${id}`).rows[0]
    return NextResponse.json(row)
  } catch (e) {
    console.error('Admin users PATCH:', e)
    if (e?.code === '23505') {
      return NextResponse.json({ error: 'Email already in use' }, { status: 409 })
    }
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
