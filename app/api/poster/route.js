import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '@/lib/db'
import { generatePosterPdfBuffer } from '../../../lib/poster-pdf'
import { uploadInspectionPdfToBlob } from '@/lib/blob/uploadPdf'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST - Generate poster PDF on demand, return PDF bytes
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}))
    const { inspectionId } = body

    if (!inspectionId) {
      return new NextResponse('Missing inspectionId', { status: 400 })
    }

    const pgUrl = getPgUrl()
    if (!pgUrl) {
      return new NextResponse('Database not configured. Please set up Postgres.', { status: 503 })
    }
    await ensureDatabase()

    const inspectionResult = await sql`
      SELECT * FROM inspections WHERE id = ${inspectionId}
    `
    if (inspectionResult.rows.length === 0) {
      return new NextResponse('Inspection not found', { status: 404 })
    }

    const inspection = inspectionResult.rows[0]

    const actionsResult = await sql`
      SELECT * FROM actions
      WHERE inspection_id = ${inspectionId} AND status = 'open'
      ORDER BY category, created_at
    `
    const actions = actionsResult.rows

    const pdfBuffer = await generatePosterPdfBuffer(inspection, actions)
    const posterPdfUrl = await uploadInspectionPdfToBlob({
      inspectionId,
      pdfBytes: pdfBuffer,
      kind: 'poster',
    })

    await sql`
      UPDATE inspections
      SET poster_pdf_url = ${posterPdfUrl},
          pdf_generation_error = NULL
      WHERE id = ${inspectionId}
    `

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="poster-${inspectionId}.pdf"`,
        'Cache-Control': 'no-store',
        'X-Poster-Pdf-Url': posterPdfUrl,
      },
    })
  } catch (error) {
    console.error('[Poster] Error:', error)
    return new NextResponse(error.message || 'Poster generation failed', { status: 500 })
  }
}
