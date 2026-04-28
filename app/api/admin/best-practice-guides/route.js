import { NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '@/lib/db'
import { getAppAdminAccess } from '@/lib/app-admin-access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function requireAdmin() {
  const access = await getAppAdminAccess()
  if (!access.userId) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!access.ok) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  if (!getPgUrl()) return { error: NextResponse.json({ error: 'Database not configured' }, { status: 503 }) }
  await ensureDatabase()
  return { access }
}

function clean(value, max = 255) {
  const s = String(value || '').trim()
  return s ? s.slice(0, max) : null
}

function slug(value) {
  return String(value || 'guide')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'guide'
}

export async function GET() {
  const gate = await requireAdmin()
  if (gate.error) return gate.error

  try {
    const result = await sql`
      SELECT
        id, template_id, template_key, template_name, title, file_url, file_key,
        content_type, active, created_by, created_at, updated_at
      FROM best_practice_guides
      ORDER BY active DESC, updated_at DESC
    `
    return NextResponse.json(result.rows)
  } catch (e) {
    console.error('[admin/best-practice-guides] GET:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error

  try {
    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'PDF file is required' }, { status: 400 })
    }
    if (file.type && file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Only PDF guides are supported in Phase 1' }, { status: 400 })
    }
    if (!String(file.name || '').toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Only PDF guides are supported in Phase 1' }, { status: 400 })
    }

    const templateId = clean(form.get('template_id'))
    const templateKey = clean(form.get('template_key'))
    const templateName = clean(form.get('template_name'))
    const title = clean(form.get('title')) || templateName || 'Best Practice Guide'
    if (!templateId && !templateKey && !templateName) {
      return NextResponse.json({ error: 'Link the guide to a template id, key, or name' }, { status: 400 })
    }

    const id = `bpg_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`
    const filename = `best-practice-guides/${slug(templateKey || templateId || templateName)}/${id}.pdf`
    const bytes = Buffer.from(await file.arrayBuffer())
    const blob = await put(filename, bytes, {
      access: 'public',
      contentType: 'application/pdf',
      addRandomSuffix: false,
      cacheControlMaxAge: 0,
    })

    await sql`
      INSERT INTO best_practice_guides (
        id, template_id, template_key, template_name, title, file_url, file_key,
        content_type, active, created_by
      )
      VALUES (
        ${id}, ${templateId}, ${templateKey}, ${templateName}, ${title}, ${blob.url}, ${filename},
        'application/pdf', true, ${gate.access.userId}
      )
    `
    const row = (await sql`
      SELECT id, template_id, template_key, template_name, title, file_url, file_key,
        content_type, active, created_by, created_at, updated_at
      FROM best_practice_guides
      WHERE id = ${id}
      LIMIT 1
    `).rows[0]
    return NextResponse.json(row, { status: 201 })
  } catch (e) {
    console.error('[admin/best-practice-guides] POST:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
