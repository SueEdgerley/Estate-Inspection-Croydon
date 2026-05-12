import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '@/lib/db'
import {
  A4,
  createStandardPdfDocument,
  drawWrappedText,
  hexToRgb,
  rgb,
  safeText,
} from '@/lib/pdf/pdfLibHelpers'
import {
  buildActionDisplay,
  cleanActionDisplayText,
  formatActionDate,
} from '@/lib/action-display-formatter'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MARGIN = 48
const PAGE_WIDTH = A4[0] - MARGIN * 2

function notRecorded(value) {
  const text = safeText(value)
  return text || 'Not recorded'
}

function addPage(ctx) {
  ctx.page = ctx.pdfDoc.addPage(A4)
  ctx.y = A4[1] - MARGIN
}

function ensureSpace(ctx, needed) {
  if (ctx.y - needed >= MARGIN) return
  addPage(ctx)
}

function drawLabelValue(ctx, label, value) {
  const text = `${label}: ${notRecorded(value)}`
  ctx.y = drawWrappedText(ctx.page, text, {
    x: MARGIN,
    y: ctx.y,
    width: PAGE_WIDTH,
    font: ctx.fonts.regular,
    size: 10,
    lineHeight: 13,
    color: hexToRgb('#334155'),
  }) - 2
}

async function buildActionPlanPdf({ inspection, actions }) {
  const { pdfDoc, fonts } = await createStandardPdfDocument()
  const ctx = { pdfDoc, fonts, page: null, y: 0 }
  addPage(ctx)

  const inspectionTitle = cleanActionDisplayText(inspection.title || inspection.location_label) || 'Inspection action plan'
  ctx.page.drawText('Action Plan', {
    x: MARGIN,
    y: ctx.y,
    size: 22,
    font: fonts.bold,
    color: hexToRgb('#0f172a'),
  })
  ctx.y -= 28

  ctx.y = drawWrappedText(ctx.page, notRecorded(inspectionTitle), {
    x: MARGIN,
    y: ctx.y,
    width: PAGE_WIDTH,
    font: fonts.bold,
    size: 13,
    lineHeight: 16,
    color: hexToRgb('#0f766e'),
  }) - 6
  drawLabelValue(ctx, 'Inspection date', formatActionDate(inspection.submitted_at || inspection.created_at))
  drawLabelValue(ctx, 'Generated', formatActionDate(new Date()))
  ctx.y -= 12

  if (!actions.length) {
    ctx.page.drawText('No issues/actions match the current filter.', {
      x: MARGIN,
      y: ctx.y,
      size: 11,
      font: fonts.regular,
      color: rgb(0.35, 0.35, 0.35),
    })
    return Buffer.from(await pdfDoc.save())
  }

  actions.forEach((action, index) => {
    const display = buildActionDisplay(action)
    ensureSpace(ctx, 130)
    ctx.page.drawText(`${index + 1}. ${notRecorded(display.issue || display.comment).slice(0, 90)}`, {
      x: MARGIN,
      y: ctx.y,
      size: 12,
      font: fonts.bold,
      color: hexToRgb('#111827'),
    })
    ctx.y -= 18

    drawLabelValue(ctx, 'Section/category', display.section)
    drawLabelValue(ctx, 'Block/location', [display.location, display.blockLocation].filter(Boolean).join(' - '))
    if (display.rating) drawLabelValue(ctx, 'Rating', display.rating)
    drawLabelValue(ctx, 'Status', display.status)
    drawLabelValue(ctx, 'Priority', display.priority)
    drawLabelValue(ctx, 'Submitted by', display.submittedBy)
    drawLabelValue(ctx, 'Inspection date', display.inspectionDate)
    drawLabelValue(ctx, 'Assigned to', display.assignedTo)
    drawLabelValue(ctx, 'Target completion', display.targetCompletionDate)
    drawLabelValue(ctx, 'Job number', display.jobNumber)
    if (display.hasPhoto) drawLabelValue(ctx, 'Photo', 'Photo attached')

    if (display.comment) {
      ctx.y -= 2
      ctx.y = drawWrappedText(ctx.page, `Comment: ${display.comment}`, {
        x: MARGIN,
        y: ctx.y,
        width: PAGE_WIDTH,
        font: fonts.regular,
        size: 10,
        lineHeight: 13,
        maxLines: 8,
        color: hexToRgb('#111827'),
      }) - 4
    }

    if (display.repairNotes) {
      ctx.y = drawWrappedText(ctx.page, `Notes/update: ${display.repairNotes}`, {
        x: MARGIN,
        y: ctx.y,
        width: PAGE_WIDTH,
        font: fonts.regular,
        size: 10,
        lineHeight: 13,
        maxLines: 6,
        color: hexToRgb('#334155'),
      }) - 4
    }

    ctx.page.drawLine({
      start: { x: MARGIN, y: ctx.y },
      end: { x: A4[0] - MARGIN, y: ctx.y },
      thickness: 0.5,
      color: hexToRgb('#cbd5e1'),
    })
    ctx.y -= 16
  })

  return Buffer.from(await pdfDoc.save())
}

function normalizeActionIds(value) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map((id) => String(id || '').trim()).filter(Boolean))].slice(0, 500)
}

export async function POST(request) {
  try {
    const { userId } = await auth()
    if (!userId) return new NextResponse('Unauthorized', { status: 401 })

    const body = await request.json().catch(() => ({}))
    const inspectionId = String(body.inspectionId || '').trim()
    const actionIds = normalizeActionIds(body.actionIds)

    if (!inspectionId) return new NextResponse('Missing inspectionId', { status: 400 })

    const pgUrl = getPgUrl()
    if (!pgUrl) return new NextResponse('Database not configured. Please set up Postgres.', { status: 503 })
    await ensureDatabase()

    const inspectionResult = await sql`
      SELECT id, title, location_label, submitted_at, created_at
      FROM inspections
      WHERE id = ${inspectionId}
      LIMIT 1
    `
    const inspection = inspectionResult.rows[0]
    if (!inspection) return new NextResponse('Inspection not found', { status: 404 })

    const actionsResult = actionIds.length
      ? await sql.query(
          `
            SELECT
              a.id, a.inspection_id, a.section_name, a.question_id, a.category, a.priority, a.title, a.description,
              a.location, a.status, a.comment, a.job_number, a.expected_completion_date,
              a.repair_notes, a.repair_photo_url, a.photo_urls, a.created_at,
              COALESCE(i.inspector_name, i.inspector_id, 'Inspector') AS created_by,
              p.name AS assigned_to,
              i.location_label AS inspection_location_label,
              i.due_date AS inspection_due_date,
              i.submitted_at AS inspection_submitted_at,
              i.created_at AS inspection_created_at,
              COALESCE(NULLIF(CONCAT_WS(' / ', e.name, b.name), ''), i.location_label, i.title) AS estate_block_name
            FROM actions a
            LEFT JOIN inspections i ON i.id = a.inspection_id
            LEFT JOIN estates e ON e.id = i.estate_id
            LEFT JOIN blocks b ON b.id = COALESCE(a.block_id, i.block_id)
            LEFT JOIN people p ON p.id = a.recipient_person_id
            WHERE a.inspection_id = $1 AND a.id = ANY($2::text[])
            ORDER BY array_position($2::text[], a.id)
          `,
          [inspectionId, actionIds]
        )
      : { rows: [] }

    const pdfBuffer = await buildActionPlanPdf({
      inspection,
      actions: actionsResult.rows || [],
    })

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="action-plan.pdf"',
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('[Action Plan PDF] Error:', error)
    return new NextResponse(error?.message || 'Action plan PDF generation failed', { status: 500 })
  }
}
