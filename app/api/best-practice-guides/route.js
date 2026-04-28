import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function clean(value) {
  const s = String(value || '').trim()
  return s || null
}

export async function GET(request) {
  if (!getPgUrl()) return NextResponse.json({ guide: null })

  try {
    await ensureDatabase()
    const { searchParams } = new URL(request.url)
    const templateId = clean(searchParams.get('template_id'))
    const templateKey = clean(searchParams.get('template_key'))
    const templateName = clean(searchParams.get('template_name'))

    if (!templateId && !templateKey && !templateName) {
      return NextResponse.json({ guide: null })
    }

    const result = await sql`
      SELECT id, template_id, template_key, template_name, title, file_url, content_type
      FROM best_practice_guides
      WHERE active = true
        AND (
          (${templateId}::text IS NOT NULL AND template_id = ${templateId})
          OR (${templateKey}::text IS NOT NULL AND template_key = ${templateKey})
          OR (${templateName}::text IS NOT NULL AND lower(trim(template_name)) = lower(trim(${templateName})))
        )
      ORDER BY
        CASE
          WHEN ${templateId}::text IS NOT NULL AND template_id = ${templateId} THEN 0
          WHEN ${templateKey}::text IS NOT NULL AND template_key = ${templateKey} THEN 1
          ELSE 2
        END,
        updated_at DESC
      LIMIT 1
    `

    return NextResponse.json({ guide: result.rows[0] || null })
  } catch (e) {
    console.error('[best-practice-guides] GET:', e)
    return NextResponse.json({ guide: null, error: e.message }, { status: 500 })
  }
}
