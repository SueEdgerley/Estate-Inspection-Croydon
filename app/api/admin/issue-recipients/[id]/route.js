import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '@/lib/db'
import { getAppAdminAccess } from '@/lib/app-admin-access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CATEGORY = 'issue_recipient'

function normalizeEmail(value) {
  return value && String(value).trim().toLowerCase()
}

function displayCategory(category, role) {
  if (category === CATEGORY || role === CATEGORY) return 'Issue recipient'
  if (category === 'staff') return 'Staff'
  return category ? String(category) : 'Person'
}

function isIssueRecipient(row) {
  const category = row?.category ? String(row.category).trim().toLowerCase() : ''
  const role = row?.role ? String(row.role).trim().toLowerCase() : ''
  return [category, role].some((value) =>
    ['issue_recipient', 'issue recipient', 'routing_mailbox', 'routing mailbox'].includes(value)
  )
}

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
      SELECT id, name, email, category, role, active FROM people
      WHERE id = ${id}
        AND (
          lower(trim(COALESCE(category, ''))) IN ('issue_recipient', 'issue recipient', 'routing_mailbox', 'routing mailbox')
          OR lower(trim(COALESCE(role, ''))) IN ('issue_recipient', 'issue recipient', 'routing_mailbox', 'routing mailbox')
        )
      LIMIT 1
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
      const em = normalizeEmail(body.email)
      if (!em) return NextResponse.json({ error: 'email cannot be empty' }, { status: 400 })
      const clash = await sql`
        SELECT id, category FROM people WHERE lower(trim(email)) = ${em} AND id IS DISTINCT FROM ${id} LIMIT 1
      `
      const clashRow = clash.rows[0]
      if (clashRow?.id) {
        await sql`
          UPDATE people
          SET
            name = ${name},
            email = ${em},
            role = ${CATEGORY},
            active = true,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ${clashRow.id}
        `
        if (cur.rows[0].category === CATEGORY) {
          await sql`
            UPDATE people
            SET active = false, updated_at = CURRENT_TIMESTAMP
            WHERE id = ${id} AND category = ${CATEGORY}
          `
        } else {
          await sql`
            UPDATE people
            SET role = null, updated_at = CURRENT_TIMESTAMP
            WHERE id = ${id} AND role = ${CATEGORY}
          `
        }
        const reused = (
          await sql`
            SELECT id, name, email, category, role, job_title, active
            FROM people
            WHERE id = ${clashRow.id}
            LIMIT 1
          `
        ).rows[0]
        return NextResponse.json({
          ...reused,
          reused: true,
          replaced_id: id,
          recipient_type: isIssueRecipient(reused) ? 'routing_mailbox' : 'existing_person',
          category_label: displayCategory(reused.category, reused.role),
        })
      }
      email = em
    }
    if (body.name === undefined && body.email === undefined) {
      return NextResponse.json({ error: 'Provide name and/or email' }, { status: 400 })
    }
    await sql`
      UPDATE people SET name = ${name}, email = ${email}, role = ${CATEGORY}, updated_at = CURRENT_TIMESTAMP WHERE id = ${id}
    `
    const row = (await sql`SELECT id, name, email, category, role, job_title, active FROM people WHERE id = ${id}`).rows[0]
    return NextResponse.json({
      ...row,
      reused: false,
      recipient_type: isIssueRecipient(row) ? 'routing_mailbox' : 'existing_person',
      category_label: displayCategory(row.category, row.role),
    })
  } catch (e) {
    console.error('issue-recipients PATCH:', e)
    if (e?.code === '23505') {
      return NextResponse.json(
        { error: 'A person with this email already exists. Refresh and select or update the existing person.' },
        { status: 409 }
      )
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
    const current = (
      await sql`
        SELECT id, category, role
        FROM people
        WHERE id = ${id}
          AND (
            lower(trim(COALESCE(category, ''))) IN ('issue_recipient', 'issue recipient', 'routing_mailbox', 'routing mailbox')
            OR lower(trim(COALESCE(role, ''))) IN ('issue_recipient', 'issue recipient', 'routing_mailbox', 'routing mailbox')
          )
        LIMIT 1
      `
    ).rows[0]
    if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const del =
      current.category === CATEGORY
        ? await sql`
            UPDATE people
            SET active = false, updated_at = CURRENT_TIMESTAMP
            WHERE id = ${id} AND category = ${CATEGORY}
            RETURNING id
          `
        : await sql`
            UPDATE people
            SET role = null, updated_at = CURRENT_TIMESTAMP
            WHERE id = ${id} AND role = ${CATEGORY}
            RETURNING id
          `
    if (del.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ ok: true, id: del.rows[0].id, active: current.category === CATEGORY ? false : true })
  } catch (e) {
    console.error('issue-recipients DELETE:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
