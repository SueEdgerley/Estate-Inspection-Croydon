import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '@/lib/db'
import { buildRepairsUpdatePdf } from '@/lib/pdf/buildRepairsUpdatePdf'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function generate(request, { params }) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!getPgUrl()) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
    }
    await ensureDatabase()

    const { id } = await params
    const inspectionResult = await sql`
      SELECT
        i.*,
        COALESCE(NULLIF(CONCAT_WS(' / ', e.name, b.name), ''), i.location_label, i.title) AS estate_block_name
      FROM inspections i
      LEFT JOIN estates e ON e.id = i.estate_id
      LEFT JOIN blocks b ON b.id = i.block_id
      WHERE i.id = ${id}
      LIMIT 1
    `

    const inspection = inspectionResult.rows[0]
    if (!inspection) {
      return NextResponse.json({ error: 'Inspection not found' }, { status: 404 })
    }

    const actionsResult = await sql`
      SELECT
        a.id, a.inspection_id, a.section_id, a.section_name, a.question_id,
        a.category, a.priority, a.title, a.description, a.location, a.status, a.comment,
        a.photo_urls, a.job_number, a.expected_completion_date,
        NULL::text AS repair_notes,
        NULL::text AS repair_photo_url,
        NULL::timestamptz AS repair_updated_at,
        a.created_at, a.updated_at,
        p.name AS recipient_name,
        p.job_title AS recipient_job_title,
        p.category AS recipient_category
      FROM actions a
      LEFT JOIN people p ON p.id = a.recipient_person_id
      WHERE a.inspection_id = ${id}
        AND (
          lower(COALESCE(a.category, '')) IN ('repair', 'repairs')
          OR lower(COALESCE(a.category, '')) LIKE '%repair%'
          OR lower(COALESCE(a.section_name, '')) LIKE '%repair%'
          OR lower(COALESCE(a.title, '')) LIKE '%repair%'
          OR lower(COALESCE(a.description, '')) LIKE '%repair%'
          OR lower(COALESCE(a.comment, '')) LIKE '%repair%'
          OR lower(COALESCE(p.name, '')) LIKE '%repair%'
          OR lower(COALESCE(p.job_title, '')) LIKE '%repair%'
          OR lower(COALESCE(p.category, '')) LIKE '%repair%'
          OR NULLIF(TRIM(COALESCE(a.job_number, '')), '') IS NOT NULL
          OR a.expected_completion_date IS NOT NULL
        )
      ORDER BY
        CASE WHEN a.status = 'completed' THEN 1 ELSE 0 END,
        a.updated_at DESC,
        a.created_at DESC
    `

    const pdfBuffer = await buildRepairsUpdatePdf({
      inspection,
      actions: actionsResult.rows || [],
    })

    const filename = `repairs-update-${String(id).slice(0, 12)}.pdf`
    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('[repairs-update-pdf]', error)
    return NextResponse.json(
      { error: 'Repairs update PDF generation failed', details: error?.message || String(error) },
      { status: 500 }
    )
  }
}

export async function GET(request, context) {
  return generate(request, context)
}

export async function POST(request, context) {
  return generate(request, context)
}
