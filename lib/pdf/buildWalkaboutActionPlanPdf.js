import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import {
  A4,
  createStandardPdfDocument,
  drawWrappedText,
  hexToRgb,
  rgb,
  safeText,
} from '@/lib/pdf/pdfLibHelpers'
import { cleanActionDisplayText } from '@/lib/action-display-formatter'
import {
  CROYDON_HOUSING_LOGO_FILE,
  PDF_LOGO_MAX_HEIGHT,
  PDF_LOGO_MAX_WIDTH,
} from '@/lib/logo-branding'

const MARGIN = 38
const BLUE = '#1e3a8a'
const DARK = '#111827'
const MUTED = '#64748b'
const BORDER = '#cbd5e1'
const SOFT = '#f8fafc'
const ROW_HEIGHT = 104
const HEADER_HEIGHT = 24
const COLS = [
  { key: 'issue', label: 'ISSUE', width: 132 },
  { key: 'location', label: 'LOCATION', width: 88 },
  { key: 'actionSummary', label: 'ACTION / SUMMARY', width: 138 },
  { key: 'jobNumber', label: 'JOB NUMBER', width: 58 },
  { key: 'status', label: 'STATUS', width: 48 },
  { key: 'raisedBy', label: 'RAISED BY', width: 55 },
]

function formatDate(value, fallback = '-') {
  if (!value) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return fallback
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function formatStatus(value) {
  const status = String(value || '').trim()
  if (!status) return 'Open'
  return status
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function cleanCellText(value) {
  return cleanActionDisplayText(value, { preserveLabels: true })
    .split(/\r?\n/)
    .filter((line) => {
      const s = line.trim()
      return (
        s &&
        !/^inspection\s*:/i.test(s) &&
        !/^estate\s*\/\s*area\s*:/i.test(s) &&
        !/^photos?\s*:/i.test(s) &&
        !/^https?:\/\//i.test(s)
      )
    })
    .join('\n')
}

async function loadLogoImage(pdfDoc) {
  try {
    const logoPath = path.join(process.cwd(), 'public', CROYDON_HOUSING_LOGO_FILE)
    if (!fs.existsSync(logoPath)) return null
    const png = await sharp(fs.readFileSync(logoPath)).png().toBuffer()
    return await pdfDoc.embedPng(png)
  } catch (error) {
    console.warn('[walkabout-action-plan-pdf] logo skipped:', error?.message || error)
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

function drawPageHeader(ctx) {
  const contentWidth = A4[0] - MARGIN * 2
  const logoWidth = drawLogo(ctx, MARGIN, ctx.y, PDF_LOGO_MAX_WIDTH, PDF_LOGO_MAX_HEIGHT)
  const titleX = MARGIN + logoWidth + 18

  ctx.page.drawText('Walkabout Action Plan', {
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
    end: { x: MARGIN + contentWidth, y: ctx.y - 58 },
    thickness: 1,
    color: hexToRgb(BORDER),
  })
  ctx.y -= 78
}

function ensureSpace(ctx, needed) {
  if (ctx.y - needed >= MARGIN) return
  addPage(ctx)
}

function drawMeta(ctx, inspection) {
  const contentWidth = A4[0] - MARGIN * 2
  const estateBlock = inspection.estate_block_name || inspection.location_label || inspection.title || 'Estate / block'
  const walkaboutDate = inspection.submitted_at || inspection.created_at
  const officer = inspection.inspector_name || inspection.inspector_id || '-'

  ctx.y = drawWrappedText(ctx.page, safeText(estateBlock), {
    x: MARGIN,
    y: ctx.y,
    width: contentWidth,
    font: ctx.fonts.bold,
    size: 13,
    color: hexToRgb(BLUE),
    lineHeight: 16,
    maxLines: 2,
  })
  ctx.y -= 6
  ctx.page.drawText(`Walkabout date: ${formatDate(walkaboutDate)}`, {
    x: MARGIN,
    y: ctx.y,
    size: 10,
    font: ctx.fonts.regular,
    color: hexToRgb(MUTED),
  })
  ctx.page.drawText(`Officer/user: ${safeText(officer)}`, {
    x: MARGIN + 230,
    y: ctx.y,
    size: 10,
    font: ctx.fonts.regular,
    color: hexToRgb(MUTED),
  })
  ctx.y -= 26
}

function drawTableHeader(ctx) {
  const contentWidth = A4[0] - MARGIN * 2
  ctx.page.drawRectangle({
    x: MARGIN,
    y: ctx.y - HEADER_HEIGHT,
    width: contentWidth,
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
      size: 6.8,
      font: ctx.fonts.bold,
      color: hexToRgb(BLUE),
    })
    x += col.width
  }
  ctx.y -= HEADER_HEIGHT
}

function drawTableRow(ctx, item, index) {
  const contentWidth = A4[0] - MARGIN * 2
  ensureSpace(ctx, ROW_HEIGHT + HEADER_HEIGHT + 8)
  if (index === 0 || ctx.y > A4[1] - MARGIN - 100) drawTableHeader(ctx)

  const top = ctx.y
  const bottom = top - ROW_HEIGHT
  ctx.page.drawRectangle({
    x: MARGIN,
    y: bottom,
    width: contentWidth,
    height: ROW_HEIGHT,
    color: rgb(1, 1, 1),
    borderColor: hexToRgb(BORDER),
    borderWidth: 1,
  })

  let x = MARGIN
  const values = {
    issue: cleanCellText(item.issue || item.question || item.title || '-'),
    location: cleanCellText(item.location || ''),
    actionSummary: cleanCellText(item.actionSummary || item.comment || ''),
    jobNumber: cleanCellText(item.jobNumber || ''),
    status: formatStatus(item.status || 'Open'),
    raisedBy: cleanCellText(item.raisedBy || ''),
  }

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
      size: 7.4,
      color: col.key === 'status' ? hexToRgb(BLUE) : hexToRgb(DARK),
      lineHeight: 9,
      maxLines: col.key === 'actionSummary' ? 9 : 6,
    })
    x += col.width
  }

  ctx.y = bottom - 8
}

export async function buildWalkaboutActionPlanPdf({ inspection, items }) {
  const { pdfDoc, fonts } = await createStandardPdfDocument()
  const logoImage = await loadLogoImage(pdfDoc)
  const ctx = { pdfDoc, fonts, logoImage, page: null, y: A4[1] - MARGIN }
  addPage(ctx)

  const rows = Array.isArray(items) ? items : []
  drawMeta(ctx, inspection)

  if (!rows.length) {
    ctx.page.drawText('No Walkabout follow-up items were recorded for this inspection.', {
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
