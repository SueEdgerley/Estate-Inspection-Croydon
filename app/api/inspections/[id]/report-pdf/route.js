import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '@/lib/db'
import { ensureFullInspectionPdf } from '@/lib/full-inspection-report-pdf'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST — ensure full inspection report PDF exists (generate + Blob + DB if missing).
 * Query: regenerate=1 forces rebuild even when full_pdf_url is set.
 */
export async function POST(request, { params }) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await ensureDatabase()
    if (!getPgUrl()) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
    }

    const { id } = await params
    const url = new URL(request.url)
    const forceRegenerate = url.searchParams.get('regenerate') === '1'

    const result = await ensureFullInspectionPdf(sql, {
      inspectionId: id,
      forceRegenerate,
    })

    if (!result.ok && result.error === 'not_found') {
      return NextResponse.json({ error: 'Inspection not found' }, { status: 404 })
    }
    if (!result.ok) {
      return NextResponse.json(
        { error: 'PDF generation failed', details: result.error },
        { status: 502 }
      )
    }

    return NextResponse.json({
      url: result.url,
      generated: result.generated === true,
    })
  } catch (e) {
    console.error('[report-pdf]', e)
    return NextResponse.json(
      { error: 'Unexpected error', details: e?.message || String(e) },
      { status: 500 }
    )
  }
}
