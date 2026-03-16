import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { getPgUrl } from '@/lib/db'
import { getRouteAccess } from '@/lib/permissions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function requireAdmin() {
  const { denialResponse } = await getRouteAccess({ requireAdmin: true })
  if (denialResponse) return denialResponse
  if (!getPgUrl()) return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  return null
}

export async function GET() {
  const err = await requireAdmin()
  if (err) return err
  try {
    const limit = 50
    const result = await sql`
      SELECT id, type, title, location_label, template_id, template_name,
             status, submitted_at, created_at, inspector_id, inspector_name,
             pdf_url, full_pdf_url, poster_pdf_url, estate_id, block_id,
             template_version IS NOT NULL AS has_template_snapshot
      FROM inspections
      ORDER BY submitted_at DESC NULLS LAST, created_at DESC
      LIMIT ${limit}
    `
    return NextResponse.json(result.rows)
  } catch (e) {
    console.error('Admin inspections GET:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
