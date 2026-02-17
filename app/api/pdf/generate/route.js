import { NextResponse } from 'next/server'
import { generatePosterPdf } from '@/lib/poster-pdf'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST - Generate Estate Walkabout Poster PDF
export async function POST(request) {
  try {
    const body = await request.json()
    const { inspection, actions = [] } = body

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
