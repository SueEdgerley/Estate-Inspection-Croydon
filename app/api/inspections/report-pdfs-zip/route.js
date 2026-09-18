import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '@/lib/db'
import { ensureFullInspectionPdf } from '@/lib/full-inspection-report-pdf'
import { getOwnRecordViewer } from '@/lib/own-record-access'
import { buildZipArchive } from '@/lib/zip-store'
import {
  MAX_BULK_PDF_IDS,
  buildBulkZipFilename,
  buildInspectionPdfFilename,
  formatBulkPdfZipMessage,
  normalizeBulkPdfIds,
  partitionBulkPdfAccess,
} from '@/lib/inspection-report-zip'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * POST { ids: string[] } — ZIP of selected inspection report PDFs.
 * Uses existing full PDFs when available; generates missing ones.
 * Authorisation is server-side (Housing Officer own-record).
 */
export async function POST(request) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await ensureDatabase()
    if (!getPgUrl()) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
    }

    const body = await request.json().catch(() => ({}))
    const ids = normalizeBulkPdfIds(body?.ids)
    if (ids.length === 0) {
      return NextResponse.json({ error: 'Please select at least one inspection to download' }, { status: 400 })
    }
    if (ids.length > MAX_BULK_PDF_IDS) {
      return NextResponse.json(
        { error: `Please select at most ${MAX_BULK_PDF_IDS} inspections` },
        { status: 400 }
      )
    }

    const viewer = await getOwnRecordViewer()
    if (viewer.error) return viewer.error

    const listed = await sql.query(
      `SELECT
          i.id,
          i.inspector_id,
          i.submitted_at,
          i.created_at,
          i.status,
          i.location_label,
          b.name AS block_name,
          e.name AS estate_name
        FROM inspections i
        LEFT JOIN blocks b ON b.id = i.block_id
        LEFT JOIN estates e ON e.id = i.estate_id
        WHERE i.id = ANY($1::text[])`,
      [ids]
    )

    const { allowed, failed } = partitionBulkPdfAccess(viewer, ids, listed.rows || [])
    if (allowed.length === 0 && failed.some((row) => row.reason === 'not_authorised')) {
      const allDenied = failed.length === ids.length && failed.every((row) => row.reason === 'not_authorised')
      if (allDenied) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const zipFiles = []
    const usedNames = new Set()
    const included = []

    for (const row of allowed) {
      const result = await ensureFullInspectionPdf(sql, {
        inspectionId: row.id,
        forceRegenerate: false,
        includeBytes: true,
      })
      if (!result.ok || !result.bytes) {
        failed.push({
          id: row.id,
          reason: result.error || 'pdf_failed',
          label: row.block_name || row.location_label || row.id,
        })
        continue
      }
      const filename = buildInspectionPdfFilename(row, usedNames)
      zipFiles.push({ name: filename, bytes: result.bytes })
      included.push({ id: row.id, filename })
    }

    const message = formatBulkPdfZipMessage({
      requested: ids.length,
      included: included.length,
      failed: failed.length,
    })

    if (included.length === 0) {
      return NextResponse.json(
        {
          error: message,
          requested: ids.length,
          included: 0,
          failed,
        },
        { status: 422 }
      )
    }

    const zipBytes = buildZipArchive(zipFiles)
    const zipName = buildBulkZipFilename()
    const headers = {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${zipName}"`,
      'Cache-Control': 'no-store',
      'X-Pdf-Zip-Filename': zipName,
      'X-Pdf-Zip-Requested': String(ids.length),
      'X-Pdf-Zip-Included': String(included.length),
      'X-Pdf-Zip-Failed': String(failed.length),
      'X-Pdf-Zip-Message': encodeURIComponent(message),
      'Access-Control-Expose-Headers':
        'Content-Disposition, X-Pdf-Zip-Filename, X-Pdf-Zip-Requested, X-Pdf-Zip-Included, X-Pdf-Zip-Failed, X-Pdf-Zip-Message',
    }

    return new NextResponse(new Uint8Array(zipBytes), { status: 200, headers })
  } catch (e) {
    console.error('[report-pdfs-zip]', e)
    return NextResponse.json(
      { error: 'Unexpected error', details: e?.message || String(e) },
      { status: 500 }
    )
  }
}
