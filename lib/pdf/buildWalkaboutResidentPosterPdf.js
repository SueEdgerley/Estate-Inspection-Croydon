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
  splitText,
} from '@/lib/pdf/pdfLibHelpers'

const MARGIN = 36
const BLUE = '#1e3a8a'
const DARK = '#111827'
const MUTED = '#64748b'
const BORDER = '#cbd5e1'
const TABLE_HEAD = '#e0f2fe'
const PHOTO_BG = '#f8fafc'
const MIN_ROW_HEIGHT = 122
const MAX_ROW_HEIGHT = 168
const PHOTO_COL_WIDTH = 168
const MAX_IMAGE_WIDTH = 900
const JPEG_QUALITY = 72
const LABEL_WIDTH = 128
const DETAIL_FONT_SIZE = 8.8
const DETAIL_LINE_HEIGHT = 10.8

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
  return status.replace(/[_-]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

function parsePhotoUrls(raw) {
  if (Array.isArray(raw)) return raw.filter((url) => typeof url === 'string' && url.trim())
  if (typeof raw === 'string' && raw.trim()) {
    try {
      return parsePhotoUrls(JSON.parse(raw))
    } catch {
      return raw.startsWith('http') ? [raw] : []
    }
  }
  return []
}

function photoUrlsForItem(item) {
  return parsePhotoUrls(item.photo_urls)
}

function issueTextForItem(item) {
  return safeText(item.comment || item.description || item.title || item.question || '')
}

function hasUsefulPosterContent(item) {
  return Boolean(
    issueTextForItem(item) ||
      photoUrlsForItem(item).length ||
      item.job_number ||
      item.expected_completion_date
  )
}

async function loadLogoImage(pdfDoc) {
  try {
    const logoPath = path.join(process.cwd(), 'public', 'croydon-housing-logo.svg')
    if (!fs.existsSync(logoPath)) return null
    const png = await sharp(fs.readFileSync(logoPath), { density: 300 }).png().toBuffer()
    return await pdfDoc.embedPng(png)
  } catch (error) {
    console.warn('[walkabout-resident-poster-pdf] logo skipped:', error?.message || error)
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
    console.warn('[walkabout-resident-poster-pdf] photo skipped:', error?.message || error)
    return null
  }
}

function drawLogo(ctx, x, y, maxWidth, maxHeight) {
  const { page, logoImage } = ctx
  if (!logoImage) {
    page.drawText('Croydon Council Housing', {
      x,
      y: y - 14,
      size: 12,
      font: ctx.fonts.bold,
      color: hexToRgb(BLUE),
    })
    page.drawText('Resident noticeboard update', {
      x,
      y: y - 28,
      size: 8,
      font: ctx.fonts.regular,
      color: hexToRgb(MUTED),
    })
    return maxWidth
  }

  const scale = Math.min(maxWidth / logoImage.width, maxHeight / logoImage.height, 1)
  const width = logoImage.width * scale
  const height = logoImage.height * scale
  page.drawImage(logoImage, { x, y: y - height - 1, width, height })
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
  const logoWidth = drawLogo(ctx, MARGIN, ctx.y, 160, 42)
  const titleX = MARGIN + logoWidth + 24

  page.drawText('Walkabout Resident Poster', {
    x: titleX,
    y: ctx.y - 13,
    size: 18,
    font: fonts.bold,
    color: hexToRgb(DARK),
  })
  page.drawText('Resident noticeboard update', {
    x: titleX,
    y: ctx.y - 29,
    size: 10,
    font: fonts.regular,
    color: hexToRgb(MUTED),
  })
  page.drawLine({
    start: { x: MARGIN, y: ctx.y - 52 },
    end: { x: MARGIN + contentWidth, y: ctx.y - 52 },
    thickness: 1,
    color: hexToRgb(BORDER),
  })
  ctx.y -= 68
}

function drawMeta(ctx, inspection, items) {
  const { page, fonts } = ctx
  const contentWidth = A4[0] - MARGIN * 2
  const locationLine = inspection.estate_block_name || inspection.location_label || inspection.title || 'Estate / block'
  const latestUpdate = items
    .map((item) => item.updated_at || item.created_at)
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
  page.drawText(`Walkabout date: ${formatDate(inspection.submitted_at || inspection.created_at, 'Not available')}`, {
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

function startTableOnNewPage(ctx) {
  addPage(ctx)
  drawTableHeader(ctx)
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
    x: x + 24,
    y: y - height / 2,
    size: 9,
    font: fonts.italic,
    color: hexToRgb(MUTED),
  })
}

async function drawPhotoCell(ctx, item, x, y, width, height) {
  const urls = photoUrlsForItem(item)
  if (!urls.length) {
    drawPlaceholderPhoto(ctx, x, y, width, height)
    return
  }

  const buffer = await imageBufferFromUrl(urls[0])
  if (!buffer) {
    drawPlaceholderPhoto(ctx, x, y, width, height)
    return
  }

  try {
    const image = await ctx.pdfDoc.embedJpg(buffer)
    const scale = Math.min(width / image.width, height / image.height, 1)
    const imageWidth = image.width * scale
    const imageHeight = image.height * scale
    const imageX = x + (width - imageWidth) / 2
    const imageY = y - height + (height - imageHeight) / 2
    ctx.page.drawRectangle({ x, y: y - height, width, height, color: hexToRgb(PHOTO_BG), borderColor: hexToRgb(BORDER), borderWidth: 1 })
    ctx.page.drawImage(image, { x: imageX, y: imageY, width: imageWidth, height: imageHeight })
  } catch {
    drawPlaceholderPhoto(ctx, x, y, width, height)
  }
}

function measureDetailLines(ctx, value, width, maxLines) {
  return Math.min(splitText(value || 'To be confirmed', ctx.fonts.regular, DETAIL_FONT_SIZE, width - LABEL_WIDTH).length, maxLines)
}

function rowHeightForItem(ctx, item, detailsWidth) {
  const issueLines = measureDetailLines(ctx, issueTextForItem(item) || 'Walkabout issue raised.', detailsWidth - 24, 4)
  const locationLines = measureDetailLines(ctx, item.location || 'To be confirmed', detailsWidth - 24, 2)
  const contentHeight = 18 + issueLines * DETAIL_LINE_HEIGHT + 5 + locationLines * DETAIL_LINE_HEIGHT + 48
  return Math.min(Math.max(contentHeight, MIN_ROW_HEIGHT), MAX_ROW_HEIGHT)
}

function drawDetailLabel(ctx, label, value, x, y, width, maxLines = 2) {
  const { page, fonts } = ctx
  page.drawText(`${label}:`, {
    x,
    y,
    size: 8.4,
    font: fonts.bold,
    color: hexToRgb(BLUE),
  })
  return drawWrappedText(page, safeText(value || 'To be confirmed'), {
    x: x + LABEL_WIDTH,
    y,
    width: width - LABEL_WIDTH,
    font: fonts.regular,
    size: DETAIL_FONT_SIZE,
    color: hexToRgb(DARK),
    lineHeight: DETAIL_LINE_HEIGHT,
    maxLines,
  }) - 2
}

async function drawPosterRow(ctx, item) {
  const { page } = ctx
  const contentWidth = A4[0] - MARGIN * 2
  const detailsX = MARGIN + PHOTO_COL_WIDTH
  const detailsWidth = contentWidth - PHOTO_COL_WIDTH
  const rowHeight = rowHeightForItem(ctx, item, detailsWidth)
  if (ctx.y - rowHeight < MARGIN) startTableOnNewPage(ctx)

  const top = ctx.y
  const bottom = top - rowHeight
  page.drawRectangle({
    x: MARGIN,
    y: bottom,
    width: contentWidth,
    height: rowHeight,
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

  await drawPhotoCell(ctx, item, MARGIN + 10, top - 10, PHOTO_COL_WIDTH - 20, rowHeight - 20)

  let detailY = top - 16
  detailY = drawDetailLabel(ctx, 'ISSUE', issueTextForItem(item) || 'Walkabout issue raised.', detailsX + 10, detailY, detailsWidth - 20, 4)
  detailY = drawDetailLabel(ctx, 'LOCATION', item.location || 'To be confirmed', detailsX + 10, detailY, detailsWidth - 20, 2)
  detailY = drawDetailLabel(ctx, 'JOB NUMBER', item.job_number || 'To be confirmed', detailsX + 10, detailY, detailsWidth - 20, 1)
  detailY = drawDetailLabel(ctx, 'EXPECTED COMPLETION DATE', formatDate(item.expected_completion_date), detailsX + 10, detailY, detailsWidth - 20, 1)
  drawDetailLabel(ctx, 'STATUS', formatStatus(item.status), detailsX + 10, detailY, detailsWidth - 20, 1)

  ctx.y = bottom
}

export async function buildWalkaboutResidentPosterPdf({ inspection, items }) {
  const { pdfDoc, fonts } = await createStandardPdfDocument()
  const logoImage = await loadLogoImage(pdfDoc)
  const ctx = { pdfDoc, fonts, logoImage, page: null, y: A4[1] - MARGIN }
  addPage(ctx)

  const posterItems = Array.isArray(items) ? items.filter(hasUsefulPosterContent) : []
  drawMeta(ctx, inspection, posterItems)
  drawTableHeader(ctx)

  if (posterItems.length === 0) {
    ctx.page.drawText('No walkabout issues are currently recorded for this inspection.', {
      x: MARGIN,
      y: ctx.y - 28,
      size: 12,
      font: fonts.regular,
      color: hexToRgb(DARK),
    })
  } else {
    for (const item of posterItems) {
      await drawPosterRow(ctx, item)
    }
  }

  ctx.page.drawText('This resident notice uses the latest available Walkabout issue updates.', {
    x: MARGIN,
    y: 20,
    size: 8,
    font: fonts.italic,
    color: hexToRgb(MUTED),
  })

  return Buffer.from(await pdfDoc.save())
}
