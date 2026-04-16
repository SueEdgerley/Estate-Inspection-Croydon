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

async function selectMergedUserRow(userId) {
  const r = await sql`
    SELECT
      u.id,
      u.people_id,
      p.id AS person_id,
      TRIM(COALESCE(NULLIF(TRIM(p.name), ''), NULLIF(TRIM(u.email), ''), '—')) AS name,
      COALESCE(NULLIF(TRIM(u.email), ''), NULLIF(TRIM(p.email), '')) AS email,
      p.role AS role,
      COALESCE(u.is_active, true) AS account_active,
      CASE WHEN p.id IS NULL THEN NULL ELSE COALESCE(p.active, true) END AS staff_directory_active,
      u.created_at
    FROM users u
    LEFT JOIN people p ON p.id = u.people_id
      AND (p.category IS DISTINCT FROM 'issue_recipient' OR p.category IS NULL)
    WHERE u.id = ${userId}
    LIMIT 1
  `
  return r.rows[0] || null
}

export async function PATCH(request, { params }) {
  const err = await requireAdmin()
  if (err) return err
  const id = params?.id
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  try {
    await ensureDatabase()
    const body = await request.json().catch(() => ({}))

    const userRow = await sql`
      SELECT id, people_id, email FROM users WHERE id = ${id} LIMIT 1
    `
    const u = userRow.rows[0]

    if (u) {
      const nextAccountActive =
        typeof body.account_active === 'boolean'
          ? body.account_active
          : typeof body.active === 'boolean'
            ? body.active
            : null
      const staffTouch =
        body.name !== undefined || body.email !== undefined || body.role !== undefined

      if (nextAccountActive === null && !staffTouch) {
        return NextResponse.json(
          { error: 'Provide account_active (or active), and/or name, email, role' },
          { status: 400 }
        )
      }

      if (nextAccountActive !== null) {
        await sql`
          UPDATE users SET is_active = ${nextAccountActive}, updated_at = CURRENT_TIMESTAMP WHERE id = ${id}
        `
        if (u.people_id) {
          await sql`
            UPDATE people SET active = ${nextAccountActive}, updated_at = CURRENT_TIMESTAMP
            WHERE id = ${u.people_id}
          `
        }
      }

      const nameTouched = body.name !== undefined
      const emailTouched = body.email !== undefined
      const roleTouched = body.role !== undefined

      if (nameTouched || emailTouched || roleTouched) {
        let peopleId = u.people_id
        if (!peopleId) {
          const em = emailTouched
            ? String(body.email).trim().toLowerCase()
            : (u.email && String(u.email).trim().toLowerCase()) || null
          if (!em) {
            return NextResponse.json({ error: 'Cannot edit staff fields without email; link staff directory first.' }, { status: 400 })
          }
          const nm = nameTouched
            ? String(body.name).trim()
            : em.split('@')[0] || 'User'
          const newPid = `person_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`
          const staffRole = roleTouched && ROLES.includes(String(body.role).toLowerCase()) ? String(body.role).toLowerCase() : null
          const staffInsertActive = nextAccountActive !== null ? nextAccountActive : true
          await sql`
            INSERT INTO people (id, name, email, role, category, active)
            VALUES (${newPid}, ${nm}, ${em}, ${staffRole}, 'staff', ${staffInsertActive})
          `
          await sql`
            UPDATE users SET people_id = ${newPid}, email = COALESCE(${em}, email), updated_at = CURRENT_TIMESTAMP WHERE id = ${id}
          `
          peopleId = newPid
        } else {
          const curP = await sql`
            SELECT id, name, email, role, active, category FROM people WHERE id = ${peopleId} LIMIT 1
          `
          const p0 = curP.rows[0]
          if (!p0) return NextResponse.json({ error: 'Linked staff row missing' }, { status: 500 })
          if (p0.category === 'issue_recipient') {
            return NextResponse.json({ error: 'Use Issue Recipients to edit routing contacts' }, { status: 400 })
          }

          let name = p0.name
          let email = p0.email
          let role = p0.role
          let active = p0.active

          if (nameTouched) {
            const n = String(body.name).trim()
            if (!n) return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 })
            name = n
          }
          if (emailTouched) {
            const em = String(body.email).trim().toLowerCase()
            if (!em) return NextResponse.json({ error: 'email cannot be empty' }, { status: 400 })
            const clash = await sql`
              SELECT id FROM people WHERE lower(trim(email)) = ${em} AND id IS DISTINCT FROM ${peopleId} LIMIT 1
            `
            if (clash.rows[0]) {
              return NextResponse.json({ error: 'Another person already uses this email' }, { status: 409 })
            }
            email = em
            await sql`
              UPDATE users SET email = ${em}, updated_at = CURRENT_TIMESTAMP WHERE id = ${id}
            `
          }
          if (roleTouched) {
            role = ROLES.includes(String(body.role).toLowerCase()) ? String(body.role).toLowerCase() : null
          }

          await sql`
            UPDATE people
            SET name = ${name}, email = ${email}, role = ${role}, active = ${active}, updated_at = CURRENT_TIMESTAMP
            WHERE id = ${peopleId}
          `
        }
      }

      const merged = await selectMergedUserRow(id)
      return NextResponse.json(merged)
    }

    /* Legacy: id is a people row without users.id match */
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
    return NextResponse.json({
      id: row.id,
      person_id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      account_active: true,
      staff_directory_active: row.active !== false,
      created_at: null,
    })
  } catch (e) {
    console.error('Admin users PATCH:', e)
    if (e?.code === '23505') {
      return NextResponse.json({ error: 'Email already in use' }, { status: 409 })
    }
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
