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

const MARGIN = 38
const BLUE = '#1e3a8a'
const DARK = '#111827'
const MUTED = '#64748b'
const BORDER = '#cbd5e1'
const SOFT = '#f8fafc'
const ROW_HEIGHT = 190
const PHOTO_WIDTH = 165
const MAX_IMAGE_WIDTH = 900
const JPEG_QUALITY = 72

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

function issueText(action) {
  const text = action.comment || action.description || action.title || 'Walkabout issue'
  return safeText(text)
}

async function loadLogoImage(pdfDoc) {
  try {
    const logoPath = path.join(process.cwd(), 'public', 'croydon-housing-logo.svg')
    if (!fs.existsSync(logoPath)) return null
    const png = await sharp(fs.readFileSync(logoPath)).png().toBuffer()
    return await pdfDoc.embedPng(png)
  } catch (error) {
    console.warn('[walkabout-action-plan-pdf] logo skipped:', error?.message || error)
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
    console.warn('[walkabout-action-plan-pdf] photo skipped:', error?.message || error)
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
  const logoWidth = drawLogo(ctx, MARGIN, ctx.y, 148, 44)
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

async function drawPhoto(ctx, action, x, y, width, height) {
  const urls = parsePhotoUrls(action.photo_urls)
  if (!urls.length) {
    ctx.page.drawRectangle({ x, y: y - height, width, height, color: hexToRgb(SOFT), borderColor: hexToRgb(BORDER), borderWidth: 1 })
    ctx.page.drawText('No photo', { x: x + 54, y: y - height / 2, size: 9, font: ctx.fonts.italic, color: hexToRgb(MUTED) })
    return
  }

  const buffer = await imageBufferFromUrl(urls[0])
  if (!buffer) {
    ctx.page.drawRectangle({ x, y: y - height, width, height, color: hexToRgb(SOFT), borderColor: hexToRgb(BORDER), borderWidth: 1 })
    ctx.page.drawText('Photo unavailable', { x: x + 32, y: y - height / 2, size: 9, font: ctx.fonts.italic, color: hexToRgb(MUTED) })
    return
  }

  try {
    const image = await ctx.pdfDoc.embedJpg(buffer)
    const scale = Math.min(width / image.width, height / image.height, 1)
    const imageWidth = image.width * scale
    const imageHeight = image.height * scale
    ctx.page.drawRectangle({ x, y: y - height, width, height, color: hexToRgb(SOFT), borderColor: hexToRgb(BORDER), borderWidth: 1 })
    ctx.page.drawImage(image, {
      x: x + (width - imageWidth) / 2,
      y: y - height + (height - imageHeight) / 2,
      width: imageWidth,
      height: imageHeight,
    })
  } catch {
    ctx.page.drawRectangle({ x, y: y - height, width, height, color: hexToRgb(SOFT), borderColor: hexToRgb(BORDER), borderWidth: 1 })
    ctx.page.drawText('Photo unavailable', { x: x + 32, y: y - height / 2, size: 9, font: ctx.fonts.italic, color: hexToRgb(MUTED) })
  }
}

function drawLineField(ctx, label, x, y, width) {
  ctx.page.drawText(label, { x, y, size: 9, font: ctx.fonts.bold, color: hexToRgb(BLUE) })
  ctx.page.drawLine({
    start: { x: x + 92, y: y - 1 },
    end: { x: x + width, y: y - 1 },
    thickness: 0.8,
    color: hexToRgb(BORDER),
  })
}

async function drawActionRow(ctx, action, index) {
  const contentWidth = A4[0] - MARGIN * 2
  ensureSpace(ctx, ROW_HEIGHT + 8)

  const top = ctx.y
  const bottom = top - ROW_HEIGHT
  const detailsX = MARGIN + PHOTO_WIDTH
  const detailsWidth = contentWidth - PHOTO_WIDTH

  ctx.page.drawRectangle({
    x: MARGIN,
    y: bottom,
    width: contentWidth,
    height: ROW_HEIGHT,
    color: rgb(1, 1, 1),
    borderColor: hexToRgb(BORDER),
    borderWidth: 1,
  })
  ctx.page.drawLine({
    start: { x: detailsX, y: top },
    end: { x: detailsX, y: bottom },
    thickness: 1,
    color: hexToRgb(BORDER),
  })

  await drawPhoto(ctx, action, MARGIN + 10, top - 12, PHOTO_WIDTH - 20, 112)

  let y = top - 16
  ctx.page.drawText(`Item ${index + 1}`, { x: detailsX + 12, y, size: 10, font: ctx.fonts.bold, color: hexToRgb(BLUE) })
  y -= 14
  y = drawWrappedText(ctx.page, `Section/question: ${safeText(action.section_name || action.title || '-')}`, {
    x: detailsX + 12,
    y,
    width: detailsWidth - 24,
    font: ctx.fonts.regular,
    size: 9,
    color: hexToRgb(MUTED),
    lineHeight: 11,
    maxLines: 2,
  })
  y -= 3
  y = drawWrappedText(ctx.page, `Issue: ${issueText(action)}`, {
    x: detailsX + 12,
    y,
    width: detailsWidth - 24,
    font: ctx.fonts.bold,
    size: 10,
    color: hexToRgb(DARK),
    lineHeight: 12,
    maxLines: 4,
  })
  if (action.location) {
    y = drawWrappedText(ctx.page, `Location: ${safeText(action.location)}`, {
      x: detailsX + 12,
      y: y - 2,
      width: detailsWidth - 24,
      font: ctx.fonts.regular,
      size: 9,
      color: hexToRgb(MUTED),
      lineHeight: 11,
      maxLines: 2,
    })
  }
  ctx.page.drawText(`Status: ${formatStatus(action.status)}`, {
    x: detailsX + 12,
    y: bottom + 46,
    size: 9,
    font: ctx.fonts.bold,
    color: hexToRgb(DARK),
  })
  drawLineField(ctx, 'Notes/check:', detailsX + 12, bottom + 28, detailsWidth - 36)
  drawLineField(ctx, 'Completion date:', detailsX + 12, bottom + 12, detailsWidth - 36)

  ctx.y = bottom - 8
}

export async function buildWalkaboutActionPlanPdf({ inspection, actions }) {
  const { pdfDoc, fonts } = await createStandardPdfDocument()
  const logoImage = await loadLogoImage(pdfDoc)
  const ctx = { pdfDoc, fonts, logoImage, page: null, y: A4[1] - MARGIN }
  addPage(ctx)

  const actionRows = Array.isArray(actions) ? actions : []
  drawMeta(ctx, inspection)

  if (!actionRows.length) {
    ctx.page.drawText('No Walkabout follow-up items were recorded for this inspection.', {
      x: MARGIN,
      y: ctx.y,
      size: 12,
      font: fonts.regular,
      color: hexToRgb(DARK),
    })
  } else {
    for (let index = 0; index < actionRows.length; index += 1) {
      await drawActionRow(ctx, actionRows[index], index)
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
