import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { sql } from '@vercel/postgres'
import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
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

const MARGIN = 38
const BLUE = '#1e3a8a'
const DARK = '#111827'
const MUTED = '#64748b'
const BORDER = '#cbd5e1'
const SOFT = '#f8fafc'
const ROW_HEIGHT = 112
const HEADER_HEIGHT = 24
const PAGE_WIDTH = A4[0] - MARGIN * 2
const COLS = [
  { key: 'issue', label: 'ISSUE', width: 104 },
  { key: 'location', label: 'LOCATION / BLOCK', width: 78 },
  { key: 'rating', label: 'RATING / GRADE', width: 58 },
  { key: 'comment', label: 'COMMENT / SUMMARY', width: 118 },
  { key: 'priorityStatus', label: 'PRIORITY / STATUS', width: 62 },
  { key: 'submittedBy', label: 'SUBMITTED BY', width: 48 },
  { key: 'inspectionDate', label: 'INSPECTION DATE', width: 51 },
]

function notRecorded(value) {
  const text = safeText(value)
  return text || 'Not recorded'
}

function formatDate(value, fallback = '-') {
  const formatted = formatActionDate(value, { fallback })
  return formatted || fallback
}

function cleanCellText(value) {
  return cleanActionDisplayText(value, { preserveLabels: true })
    .split(/\r?\n/)
    .filter((line) => {
      const text = line.trim()
      return (
        text &&
        !/^inspection\s*:/i.test(text) &&
        !/^estate\s*\/\s*area\s*:/i.test(text) &&
        !/^photos?\s*:/i.test(text) &&
        !/^https?:\/\//i.test(text)
      )
    })
    .join('\n')
}

async function loadLogoImage(pdfDoc) {
  try {
    const logoPath = path.join(process.cwd(), 'public', 'croydon-housing-logo.svg')
    if (!fs.existsSync(logoPath)) return null
    const png = await sharp(fs.readFileSync(logoPath)).png().toBuffer()
    return await pdfDoc.embedPng(png)
  } catch (error) {
    console.warn('[action-plan-pdf] logo skipped:', error?.message || error)
    return null
  }
}

function drawLogo(ctx, x, y, maxWidth, maxHeight) {
  if (!ctx.logoImage) {
    ctx.page.drawText('Croydon Housing', {
      x,
      y: y - 22,
      size: 16,
      font: ctx.fonts.bold,
      color: hexToRgb(BLUE),
    })
    return maxWidth
  }

  const scale = Math.min(maxWidth / ctx.logoImage.width, maxHeight / ctx.logoImage.height, 1)
  const width = ctx.logoImage.width * scale
  const height = ctx.logoImage.height * scale
  ctx.page.drawImage(ctx.logoImage, { x, y: y - height, width, height })
  return width
}

function addPage(ctx) {
  ctx.page = ctx.pdfDoc.addPage(A4)
  ctx.y = A4[1] - MARGIN
  drawPageHeader(ctx)
}

function ensureSpace(ctx, needed) {
  if (ctx.y - needed >= MARGIN) return
  addPage(ctx)
}

function drawPageHeader(ctx) {
  const logoWidth = drawLogo(ctx, MARGIN, ctx.y, 148, 44)
  const titleX = MARGIN + logoWidth + 18

  ctx.page.drawText('ESM Action Plan', {
    x: titleX,
    y: ctx.y - 18,
    size: 20,
    font: ctx.fonts.bold,
    color: hexToRgb(DARK),
  })
  ctx.page.drawText('Printable follow-up checklist', {
    x: titleX,
    y: ctx.y - 36,
    size: 10,
    font: ctx.fonts.regular,
    color: hexToRgb(MUTED),
  })
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y - 58 },
    end: { x: MARGIN + PAGE_WIDTH, y: ctx.y - 58 },
    thickness: 1,
    color: hexToRgb(BORDER),
  })
  ctx.y -= 78
}

function drawMeta(ctx, inspection) {
  const inspectionTitle =
    cleanActionDisplayText(inspection.estate_block_name || inspection.location_label || inspection.title) || 'Inspection action plan'

  ctx.y = drawWrappedText(ctx.page, notRecorded(inspectionTitle), {
    x: MARGIN,
    y: ctx.y,
    width: PAGE_WIDTH,
    font: ctx.fonts.bold,
    size: 13,
    lineHeight: 16,
    maxLines: 2,
    color: hexToRgb(BLUE),
  })
  ctx.y -= 6
  ctx.page.drawText(`Inspection date: ${formatDate(inspection.submitted_at || inspection.created_at)}`, {
    x: MARGIN,
    y: ctx.y,
    size: 10,
    font: ctx.fonts.regular,
    color: hexToRgb(MUTED),
  })
  ctx.y -= 26
}

function drawTableHeader(ctx) {
  ctx.page.drawRectangle({
    x: MARGIN,
    y: ctx.y - HEADER_HEIGHT,
    width: PAGE_WIDTH,
    height: HEADER_HEIGHT,
    color: hexToRgb(SOFT),
    borderColor: hexToRgb(BORDER),
    borderWidth: 1,
  })

  let x = MARGIN
  for (const col of COLS) {
    ctx.page.drawLine({
      start: { x, y: ctx.y },
      end: { x, y: ctx.y - HEADER_HEIGHT },
      thickness: 0.6,
      color: hexToRgb(BORDER),
    })
    ctx.page.drawText(col.label, {
      x: x + 4,
      y: ctx.y - 15,
      size: 6.4,
      font: ctx.fonts.bold,
      color: hexToRgb(BLUE),
    })
    x += col.width
  }
  ctx.y -= HEADER_HEIGHT
}

function drawTableRow(ctx, action, index) {
  const display = buildActionDisplay(action)
  ensureSpace(ctx, ROW_HEIGHT + HEADER_HEIGHT + 8)
  if (index === 0 || ctx.y > A4[1] - MARGIN - 100) drawTableHeader(ctx)

  const top = ctx.y
  const bottom = top - ROW_HEIGHT
  ctx.page.drawRectangle({
    x: MARGIN,
    y: bottom,
    width: PAGE_WIDTH,
    height: ROW_HEIGHT,
    color: rgb(1, 1, 1),
    borderColor: hexToRgb(BORDER),
    borderWidth: 1,
  })

  const location = [display.location, display.blockLocation].filter(Boolean).join(' - ')
  const comment = [display.comment, display.repairNotes ? `Notes/update: ${display.repairNotes}` : ''].filter(Boolean).join('\n')
  const priorityStatus = [display.priority, display.status].filter(Boolean).join(' / ')
  const photoText = display.hasPhoto ? '\nPhoto attached' : ''
  const values = {
    issue: cleanCellText(display.issue || display.comment || '-'),
    location: cleanCellText(location),
    rating: cleanCellText(display.rating),
    comment: cleanCellText(`${comment}${photoText}`),
    priorityStatus: cleanCellText(priorityStatus),
    submittedBy: cleanCellText(display.submittedBy),
    inspectionDate: cleanCellText(display.inspectionDate),
  }

  let x = MARGIN
  for (const col of COLS) {
    ctx.page.drawLine({
      start: { x, y: top },
      end: { x, y: bottom },
      thickness: 0.6,
      color: hexToRgb(BORDER),
    })
    drawWrappedText(ctx.page, safeText(values[col.key]), {
      x: x + 4,
      y: top - 12,
      width: col.width - 8,
      font: col.key === 'issue' ? ctx.fonts.bold : ctx.fonts.regular,
      size: 7.1,
      color: col.key === 'priorityStatus' ? hexToRgb(BLUE) : hexToRgb(DARK),
      lineHeight: 8.8,
      maxLines: col.key === 'comment' ? 10 : 7,
    })
    x += col.width
  }

  ctx.y = bottom - 8
}

async function buildActionPlanPdf({ inspection, actions }) {
  const { pdfDoc, fonts } = await createStandardPdfDocument()
  const logoImage = await loadLogoImage(pdfDoc)
  const ctx = { pdfDoc, fonts, logoImage, page: null, y: 0 }
  addPage(ctx)

  const rows = Array.isArray(actions) ? actions : []
  drawMeta(ctx, inspection)

  if (!rows.length) {
    ctx.page.drawText('No issues/actions match the current filter.', {
      x: MARGIN,
      y: ctx.y,
      size: 12,
      font: fonts.regular,
      color: hexToRgb(DARK),
    })
  } else {
    for (let index = 0; index < rows.length; index += 1) {
      drawTableRow(ctx, rows[index], index)
    }
  }

  ctx.page.drawText('Printed action plan - for on-site follow-up only.', {
    x: MARGIN,
    y: 20,
    size: 8,
    font: fonts.italic,
    color: hexToRgb(MUTED),
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
      SELECT
        i.id, i.title, i.location_label, i.submitted_at, i.created_at,
        COALESCE(NULLIF(CONCAT_WS(' / ', e.name, b.name), ''), i.location_label, i.title) AS estate_block_name
      FROM inspections i
      LEFT JOIN estates e ON e.id = i.estate_id
      LEFT JOIN blocks b ON b.id = i.block_id
      WHERE i.id = ${inspectionId}
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
