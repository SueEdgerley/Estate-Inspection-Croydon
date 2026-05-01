import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '@/lib/db'
import { isEstateWalkaboutTemplateVersion } from '@/lib/estate-walkabout-template'
import { buildWalkaboutActionPlanPdf } from '@/lib/pdf/buildWalkaboutActionPlanPdf'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function parseTemplateVersion(raw) {
  if (!raw) return null
  if (typeof raw === 'object') return raw
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw)
    } catch {
      return null
    }
  }
  return null
}

async function generate(request, { params }) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (!getPgUrl()) return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
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
    if (!inspection) return NextResponse.json({ error: 'Inspection not found' }, { status: 404 })

    const templateVersion = parseTemplateVersion(inspection.template_version)
    const isWalkabout =
      isEstateWalkaboutTemplateVersion(templateVersion) ||
      String(inspection.type || '').toLowerCase() === 'estate_walkabout' ||
      String(inspection.template_name || '').toLowerCase().includes('walkabout')

    if (!isWalkabout) {
      return NextResponse.json({ error: 'Walkabout action plan is only available for Walkabout inspections' }, { status: 400 })
    }

    const actionsResult = await sql`
      SELECT
        id, inspection_id, section_id, section_name, question_id,
        category, title, description, location, status, comment,
        photo_urls, created_at, updated_at
      FROM actions
      WHERE inspection_id = ${id}
        AND auto_created = true
        AND (
          question_id LIKE 'ew_it_%'
          OR question_id LIKE 'ew_chk_%'
        )
        AND (
          NULLIF(TRIM(COALESCE(comment, '')), '') IS NOT NULL
          OR NULLIF(TRIM(COALESCE(description, '')), '') IS NOT NULL
          OR (
            jsonb_typeof(photo_urls) = 'array'
            AND jsonb_array_length(photo_urls) > 0
          )
        )
      ORDER BY section_name ASC, created_at ASC
    `

    const pdfBuffer = await buildWalkaboutActionPlanPdf({
      inspection,
      actions: actionsResult.rows || [],
    })

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="walkabout-action-plan-${String(id).slice(0, 12)}.pdf"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('[walkabout-action-plan-pdf]', error)
    return NextResponse.json(
      { error: 'Walkabout action plan PDF generation failed', details: error?.message || String(error) },
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
