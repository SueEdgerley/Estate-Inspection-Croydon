import { NextResponse } from 'next/server'
import { generatePosterPdf } from '../../../../lib/poster-pdf'
import { getOwnRecordViewer, loadInspectionInspectorId, ownRecordInspectionForbidden } from '@/lib/own-record-access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST - Generate Estate Walkabout Poster PDF
export async function POST(request) {
  try {
    const viewer = await getOwnRecordViewer()
    if (viewer.error) return viewer.error
    const body = await request.json()
    const { inspection, actions = [] } = body
    if (viewer.scopeOwn && inspection?.id) {
      const stored = await loadInspectionInspectorId(inspection.id)
      if (stored) {
        const forbidden = ownRecordInspectionForbidden(viewer, stored.inspector_id)
        if (forbidden) return forbidden
      }
    }

    const pdfUrl = await generatePosterPdf(inspection, actions)

    return NextResponse.json({
      success: true,
      pdf_url: pdfUrl,
    })
  } catch (error) {
    console.error('[PDF] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to generate PDF', details: error.message },
      { status: error.message === 'inspection required' ? 400 : 500 }
    )
  }
}
