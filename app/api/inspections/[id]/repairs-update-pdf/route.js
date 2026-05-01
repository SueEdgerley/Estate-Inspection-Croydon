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
        id, inspection_id, section_id, section_name, question_id,
        category, priority, title, description, location, status, comment,
        photo_urls, job_number, expected_completion_date, created_at, updated_at
      FROM actions
      WHERE inspection_id = ${id}
      ORDER BY
        CASE WHEN status = 'completed' THEN 1 ELSE 0 END,
        updated_at DESC,
        created_at DESC
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
