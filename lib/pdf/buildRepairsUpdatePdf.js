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
import {
  CROYDON_HOUSING_LOGO_FILE,
  PDF_LOGO_MAX_HEIGHT,
  PDF_LOGO_MAX_WIDTH,
} from '@/lib/logo-branding'
import { mergeActionPhotoUrls } from '@/lib/action-photos'
import { drawActionPhotoGrid } from '@/lib/pdf/drawActionPhotos'

const MARGIN = 36
const BLUE = '#1e3a8a'
const DARK = '#111827'
const MUTED = '#64748b'
const BORDER = '#cbd5e1'
const TABLE_HEAD = '#e0f2fe'
const PHOTO_BG = '#f1f5f9'
const ROW_HEIGHT = 156
const PHOTO_COL_WIDTH = 182
const MAX_IMAGE_WIDTH = 900
const JPEG_QUALITY = 72

function formatDate(value, fallback = 'To be confirmed') {
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

function photoUrlsForAction(action) {
  return mergeActionPhotoUrls(action.repair_photo_url, action.photo_urls)
}

function buildIssueText(action) {
  const base = action.description || action.comment || action.title || 'Repair issue raised from inspection.'
  const location = action.location ? ` Location: ${action.location}` : ''
  return safeText(`${base}${location}`)
}

async function loadLogoImage(pdfDoc) {
  try {
    const logoPath = path.join(process.cwd(), 'public', CROYDON_HOUSING_LOGO_FILE)
    if (!fs.existsSync(logoPath)) return null
    const png = await sharp(fs.readFileSync(logoPath)).png().toBuffer()
    return await pdfDoc.embedPng(png)
  } catch (error) {
    console.warn('[repairs-update-pdf] logo skipped:', error?.message || error)
    return null
  }
}

async function imageBufferFromUrl(url) {
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    const buffer = Buffer.from(await response.arrayBuffer())
    const metadata = await sharp(buffer).metadata()
    let width = metadata.width || 800
    let height = metadata.height || 600
    if (width > MAX_IMAGE_WIDTH) {
      height = Math.round((height * MAX_IMAGE_WIDTH) / width)
      width = MAX_IMAGE_WIDTH
    }
    return await sharp(buffer)
      .resize(width, height, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toBuffer()
  } catch (error) {
    console.warn('[repairs-update-pdf] photo skipped:', error?.message || error)
    return null
  }
}

function drawLogo(ctx, x, y, maxWidth, maxHeight) {
  const { page, logoImage } = ctx
  if (!logoImage) {
    page.drawText('Croydon Housing', {
      x,
      y: y - 22,
      size: 16,
      font: ctx.fonts.bold,
      color: hexToRgb(BLUE),
    })
    return maxWidth
  }

  const scale = Math.min(maxWidth / logoImage.width, maxHeight / logoImage.height, 1)
  const width = logoImage.width * scale
  const height = logoImage.height * scale
  page.drawImage(logoImage, { x, y: y - height, width, height })
  return width
}

function addPage(ctx) {
  ctx.page = ctx.pdfDoc.addPage(A4)
  ctx.y = A4[1] - MARGIN
  drawPageHeader(ctx)
}

function drawPageHeader(ctx) {
  const { page, fonts } = ctx
  const contentWidth = A4[0] - MARGIN * 2
  const logoWidth = drawLogo(ctx, MARGIN, ctx.y, PDF_LOGO_MAX_WIDTH, PDF_LOGO_MAX_HEIGHT)
  const titleX = MARGIN + logoWidth + 20

  page.drawText('Estate Inspection Repairs Update', {
    x: titleX,
    y: ctx.y - 18,
    size: 19,
    font: fonts.bold,
    color: hexToRgb(DARK),
  })
  page.drawText('Resident noticeboard update', {
    x: titleX,
    y: ctx.y - 36,
    size: 10,
    font: fonts.regular,
    color: hexToRgb(MUTED),
  })
  page.drawLine({
    start: { x: MARGIN, y: ctx.y - 58 },
    end: { x: MARGIN + contentWidth, y: ctx.y - 58 },
    thickness: 1,
    color: hexToRgb(BORDER),
  })
  ctx.y -= 80
}

function ensureSpace(ctx, needed) {
  if (ctx.y - needed >= MARGIN) return
  addPage(ctx)
}

function drawMeta(ctx, inspection, actions) {
  const { page, fonts } = ctx
  const contentWidth = A4[0] - MARGIN * 2
  const locationLine = inspection.estate_block_name || inspection.location_label || inspection.title || 'Estate / block'
  const latestUpdate = actions
    .map((action) => action.repair_updated_at || action.updated_at || action.created_at)
    .filter(Boolean)
    .sort((a, b) => new Date(b) - new Date(a))[0]

  ctx.y = drawWrappedText(page, safeText(locationLine), {
    x: MARGIN,
    y: ctx.y,
    width: contentWidth,
    font: fonts.bold,
    size: 13,
    color: hexToRgb(BLUE),
    lineHeight: 16,
    maxLines: 2,
  })
  ctx.y -= 4
  page.drawText(`Inspection date: ${formatDate(inspection.submitted_at || inspection.created_at, 'Not available')}`, {
    x: MARGIN,
    y: ctx.y,
    size: 10,
    font: fonts.regular,
    color: hexToRgb(MUTED),
  })
  page.drawText(`Generated/updated: ${formatDate(latestUpdate || new Date(), 'Not available')}`, {
    x: MARGIN + 240,
    y: ctx.y,
    size: 10,
    font: fonts.regular,
    color: hexToRgb(MUTED),
  })
  ctx.y -= 24
}

function drawTableHeader(ctx) {
  const { page, fonts } = ctx
  const contentWidth = A4[0] - MARGIN * 2
  const detailsX = MARGIN + PHOTO_COL_WIDTH

  page.drawRectangle({
    x: MARGIN,
    y: ctx.y - 24,
    width: contentWidth,
    height: 24,
    color: hexToRgb(TABLE_HEAD),
    borderColor: hexToRgb(BORDER),
    borderWidth: 1,
  })
  page.drawLine({
    start: { x: detailsX, y: ctx.y },
    end: { x: detailsX, y: ctx.y - 24 },
    thickness: 1,
    color: hexToRgb(BORDER),
  })
  page.drawText('PHOTO', { x: MARGIN + 10, y: ctx.y - 16, size: 10, font: fonts.bold, color: hexToRgb(BLUE) })
  page.drawText('DETAILS', { x: detailsX + 10, y: ctx.y - 16, size: 10, font: fonts.bold, color: hexToRgb(BLUE) })
  ctx.y -= 24
}

function drawPlaceholderPhoto(ctx, x, y, width, height) {
  const { page, fonts } = ctx
  page.drawRectangle({ x, y: y - height, width, height, color: hexToRgb(PHOTO_BG), borderColor: hexToRgb(BORDER), borderWidth: 1 })
  page.drawText('No photo available', {
    x: x + 31,
    y: y - height / 2,
    size: 10,
    font: fonts.italic,
    color: hexToRgb(MUTED),
  })
}

async function drawPhotoCell(ctx, action, x, y, width, height) {
  const urls = photoUrlsForAction(action)
  if (!urls.length) {
    drawPlaceholderPhoto(ctx, x, y, width, height)
    return
  }

  const { drawn } = await drawActionPhotoGrid(ctx, urls, {
    x,
    y,
    width,
    height,
    borderColor: hexToRgb(BORDER),
    backgroundColor: hexToRgb(PHOTO_BG),
    loadJpeg: async (url) => imageBufferFromUrl(url),
  })
  if (!drawn) {
    drawPlaceholderPhoto(ctx, x, y, width, height)
  }
}

function drawDetailLabel(ctx, label, value, x, y, width, maxLines = 2) {
  const { page, fonts } = ctx
  const labelWidth = 142
  page.drawText(`${label}:`, {
    x,
    y,
    size: 9,
    font: fonts.bold,
    color: hexToRgb(BLUE),
  })
  return drawWrappedText(page, safeText(value), {
    x: x + labelWidth,
    y,
    width: width - labelWidth,
    font: fonts.regular,
    size: 9.5,
    color: hexToRgb(DARK),
    lineHeight: 12,
    maxLines,
  }) - 3
}

async function drawRepairRow(ctx, action) {
  const { page } = ctx
  const contentWidth = A4[0] - MARGIN * 2
  const detailsX = MARGIN + PHOTO_COL_WIDTH
  const detailsWidth = contentWidth - PHOTO_COL_WIDTH
  ensureSpace(ctx, ROW_HEIGHT)

  const top = ctx.y
  const bottom = top - ROW_HEIGHT
  page.drawRectangle({
    x: MARGIN,
    y: bottom,
    width: contentWidth,
    height: ROW_HEIGHT,
    color: rgb(1, 1, 1),
    borderColor: hexToRgb(BORDER),
    borderWidth: 1,
  })
  page.drawLine({
    start: { x: detailsX, y: top },
    end: { x: detailsX, y: bottom },
    thickness: 1,
    color: hexToRgb(BORDER),
  })

  await drawPhotoCell(ctx, action, MARGIN + 10, top - 12, PHOTO_COL_WIDTH - 20, ROW_HEIGHT - 24)

  let detailY = top - 18
  detailY = drawDetailLabel(ctx, 'ISSUE', buildIssueText(action), detailsX + 12, detailY, detailsWidth - 24, 5)
  detailY = drawDetailLabel(ctx, 'JOB NUMBER', action.job_number || 'To be confirmed', detailsX + 12, detailY, detailsWidth - 24, 1)
  detailY = drawDetailLabel(ctx, 'EXPECTED COMPLETION DATE', formatDate(action.expected_completion_date), detailsX + 12, detailY, detailsWidth - 24, 1)
  drawDetailLabel(ctx, 'STATUS', formatStatus(action.status), detailsX + 12, detailY, detailsWidth - 24, 1)

  ctx.y = bottom
}

export async function buildRepairsUpdatePdf({ inspection, actions }) {
  const { pdfDoc, fonts } = await createStandardPdfDocument()
  const logoImage = await loadLogoImage(pdfDoc)
  const ctx = { pdfDoc, fonts, logoImage, page: null, y: A4[1] - MARGIN }
  addPage(ctx)

  const repairActions = Array.isArray(actions) ? actions : []
  drawMeta(ctx, inspection, repairActions)
  drawTableHeader(ctx)

  if (repairActions.length === 0) {
    ctx.page.drawText('No repair actions are currently recorded for this inspection.', {
      x: MARGIN,
      y: ctx.y - 28,
      size: 12,
      font: fonts.regular,
      color: hexToRgb(DARK),
    })
  } else {
    for (const action of repairActions) {
      await drawRepairRow(ctx, action)
    }
  }

  ctx.page.drawText('This resident notice uses the latest available repairs action updates.', {
    x: MARGIN,
    y: 20,
    size: 8,
    font: fonts.italic,
    color: hexToRgb(MUTED),
  })

  return Buffer.from(await pdfDoc.save())
}
