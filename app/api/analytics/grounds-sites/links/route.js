import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { getNeonQuery, getPgUrl } from '@/lib/db'
import { getAppAdminAccess } from '@/lib/app-admin-access'
import { findGroundsMaintenanceSite } from '@/lib/grounds-maintenance-sites'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function ensureLinkTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS gm_site_links (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      block_id TEXT,
      estate_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `
}

export async function GET() {
  const access = await getAppAdminAccess()
  if (!access.ok) {
    return NextResponse.json({ error: 'Forbidden' }, { status: access.userId ? 403 : 401 })
  }
  if (!getPgUrl()) return NextResponse.json({ error: 'Database not configured' }, { status: 503 })

  const run = getNeonQuery()
  try {
    const [blocks, estates] = await Promise.all([
      run(
        `SELECT b.id, b.name, b.estate_id, e.name AS estate_name
         FROM blocks b
         LEFT JOIN estates e ON e.id = b.estate_id
         WHERE COALESCE(b.active, true) = true
         ORDER BY LOWER(b.name), b.name`,
        []
      ),
      run(`SELECT id, name FROM estates ORDER BY LOWER(name), name`, []),
    ])
    return NextResponse.json({
      blocks: blocks.rows,
      estates: estates.rows,
    })
  } catch (error) {
    console.error('[grounds-sites/links]', error)
    return NextResponse.json({ error: 'Could not load blocks and estates' }, { status: 500 })
  }
}

export async function PUT(request) {
  const access = await getAppAdminAccess()
  if (!access.ok) {
    return NextResponse.json({ error: 'Forbidden' }, { status: access.userId ? 403 : 401 })
  }
  if (!getPgUrl()) return NextResponse.json({ error: 'Database not configured' }, { status: 503 })

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const site = findGroundsMaintenanceSite(body?.siteId)
  if (!site) return NextResponse.json({ error: 'Choose a Grounds Maintenance site' }, { status: 400 })

  const blockIds = [...new Set((Array.isArray(body?.blockIds) ? body.blockIds : []).map((id) => String(id || '').trim()).filter(Boolean))]
  const estateIds = [...new Set((Array.isArray(body?.estateIds) ? body.estateIds : []).map((id) => String(id || '').trim()).filter(Boolean))]
  const run = getNeonQuery()

  if (blockIds.length > 0) {
    const found = await run(
      `SELECT id FROM blocks WHERE id = ANY($1::text[]) AND COALESCE(active, true) = true`,
      [blockIds]
    )
    if (found.rows.length !== blockIds.length) {
      return NextResponse.json({ error: 'One or more blocks are not active block records' }, { status: 400 })
    }
  }
  if (estateIds.length > 0) {
    const found = await run(`SELECT id FROM estates WHERE id = ANY($1::text[])`, [estateIds])
    if (found.rows.length !== estateIds.length) {
      return NextResponse.json({ error: 'One or more estates were not found' }, { status: 400 })
    }
  }

  await ensureLinkTable()
  await sql`DELETE FROM gm_site_links WHERE site_id = ${site.id}`
  for (const blockId of blockIds) {
    await sql`
      INSERT INTO gm_site_links (id, site_id, block_id)
      VALUES (${`gmlink_${site.id}_${blockId}`}, ${site.id}, ${blockId})
    `
  }
  for (const estateId of estateIds) {
    await sql`
      INSERT INTO gm_site_links (id, site_id, estate_id)
      VALUES (${`gmlink_${site.id}_estate_${estateId}`}, ${site.id}, ${estateId})
    `
  }

  return NextResponse.json({ ok: true, siteId: site.id, blockIds, estateIds })
}
