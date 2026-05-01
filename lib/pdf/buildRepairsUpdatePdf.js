import sharp from 'sharp'
import fs from 'fs'
import path from 'path'
import {
  A4,
  createStandardPdfDocument,
  drawWrappedText,
  hexToRgb,
  rgb,
  safeText,
} from '@/lib/pdf/pdfLibHelpers'

const MARGIN = 42
const BLUE = '#1e3a8a'
const LIGHT_BLUE = '#dbeafe'
const TEXT = '#111827'
const MUTED = '#64748b'
const BORDER = '#d1d5db'
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

function statusLabel(value) {
  const s = String(value || '').trim()
  if (!s) return 'Open'
  return s
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function parsePhotoUrls(raw) {
  if (Array.isArray(raw)) return raw.filter((url) => typeof url === 'string' && url.trim())
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw)
      return parsePhotoUrls(parsed)
    } catch {
      return raw.startsWith('http') ? [raw] : []
    }
  }
  return []
}

async function resizeImageForPdf(url) {
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

async function loadLogoImage(pdfDoc) {
  try {
    const logoPath = path.join(process.cwd(), 'public', 'croydon-housing-logo.svg')
    if (!fs.existsSync(logoPath)) return null
    const png = await sharp(fs.readFileSync(logoPath)).png().toBuffer()
    return await pdfDoc.embedPng(png)
  } catch (error) {
    console.warn('[repairs-update-pdf] logo skipped:', error?.message || error)
    return null
  }
}

function addPage(ctx) {
  ctx.page = ctx.pdfDoc.addPage(A4)
  ctx.y = A4[1] - MARGIN
  drawHeader(ctx)
}

function ensureSpace(ctx, needed) {
  if (ctx.y - needed >= MARGIN) return
  addPage(ctx)
}

function drawHeader(ctx) {
  const { page, fonts } = ctx
  const width = A4[0] - MARGIN * 2
  page.drawRectangle({ x: MARGIN, y: ctx.y - 54, width, height: 54, color: hexToRgb(BLUE) })
  let textX = MARGIN + 16
  if (ctx.logoImage) {
    const logoH = 30
    const logoW = (ctx.logoImage.width / ctx.logoImage.height) * logoH
    page.drawRectangle({ x: MARGIN + 12, y: ctx.y - 42, width: logoW + 8, height: logoH + 8, color: rgb(1, 1, 1) })
    page.drawImage(ctx.logoImage, { x: MARGIN + 16, y: ctx.y - 38, width: logoW, height: logoH })
    textX = MARGIN + 28 + logoW
  } else {
    page.drawText('Croydon Housing', {
      x: textX,
      y: ctx.y - 24,
      size: 16,
      font: fonts.bold,
      color: rgb(1, 1, 1),
    })
  }
  page.drawText('Resident noticeboard update', {
    x: textX,
    y: ctx.y - 42,
    size: 10,
    font: fonts.regular,
    color: rgb(1, 1, 1),
  })
  ctx.y -= 76
}

function drawField(ctx, label, value, x, y, width) {
  const { page, fonts } = ctx
  page.drawText(label, { x, y, size: 8, font: fonts.bold, color: hexToRgb(MUTED) })
  return drawWrappedText(page, value || 'To be confirmed', {
    x,
    y: y - 12,
    width,
    font: fonts.bold,
    size: 10,
    color: hexToRgb(TEXT),
    lineHeight: 12,
    maxLines: 2,
  })
}

async function drawPhoto(ctx, url, x, y, maxWidth, maxHeight) {
  const imgBuffer = await resizeImageForPdf(url)
  if (!imgBuffer) return false
  try {
    const image = await ctx.pdfDoc.embedJpg(imgBuffer)
    const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1)
    const width = image.width * scale
    const height = image.height * scale
    ctx.page.drawImage(image, { x, y: y - height, width, height })
    return true
  } catch {
    return false
  }
}

async function drawAction(ctx, action, index) {
  const { page, fonts } = ctx
  const width = A4[0] - MARGIN * 2
  const cardHeight = 210
  ensureSpace(ctx, cardHeight + 18)

  const cardTop = ctx.y
  const cardBottom = cardTop - cardHeight
  page.drawRectangle({
    x: MARGIN,
    y: cardBottom,
    width,
    height: cardHeight,
    color: rgb(1, 1, 1),
    borderColor: hexToRgb(BORDER),
    borderWidth: 1,
  })
  page.drawRectangle({ x: MARGIN, y: cardTop - 28, width, height: 28, color: hexToRgb(LIGHT_BLUE) })
  page.drawText(`Repair ${index + 1}`, {
    x: MARGIN + 12,
    y: cardTop - 19,
    size: 11,
    font: fonts.bold,
    color: hexToRgb(BLUE),
  })
  page.drawText(`Status: ${statusLabel(action.status)}`, {
    x: MARGIN + width - 150,
    y: cardTop - 19,
    size: 10,
    font: fonts.bold,
    color: hexToRgb(BLUE),
  })

  const contentTop = cardTop - 44
  const photoX = MARGIN + 12
  const photoW = 142
  const photoH = 104
  const photoUrls = parsePhotoUrls(action.photo_urls)
  if (photoUrls.length) {
    const ok = await drawPhoto(ctx, photoUrls[0], photoX, contentTop, photoW, photoH)
    if (!ok) {
      page.drawRectangle({ x: photoX, y: contentTop - photoH, width: photoW, height: photoH, color: rgb(0.96, 0.97, 0.98) })
      page.drawText('Photo unavailable', { x: photoX + 24, y: contentTop - 56, size: 9, font: fonts.italic, color: hexToRgb(MUTED) })
    }
  } else {
    page.drawRectangle({ x: photoX, y: contentTop - photoH, width: photoW, height: photoH, color: rgb(0.96, 0.97, 0.98) })
    page.drawText('No photo', { x: photoX + 48, y: contentTop - 56, size: 9, font: fonts.italic, color: hexToRgb(MUTED) })
  }

  const textX = photoX + photoW + 18
  const textW = MARGIN + width - textX - 12
  const description = action.description || action.comment || action.title || 'Repair issue raised from inspection.'
  let y = drawWrappedText(page, safeText(description), {
    x: textX,
    y: contentTop,
    width: textW,
    font: fonts.bold,
    size: 11,
    color: hexToRgb(TEXT),
    lineHeight: 14,
    maxLines: 5,
  })

  if (action.location) {
    y = drawWrappedText(page, `Location: ${safeText(action.location)}`, {
      x: textX,
      y: y - 4,
      width: textW,
      font: fonts.regular,
      size: 9,
      color: hexToRgb(MUTED),
      lineHeight: 12,
      maxLines: 2,
    })
  }

  const rowY = cardBottom + 52
  const colW = (width - 48) / 3
  drawField(ctx, 'JOB NUMBER', action.job_number || 'To be confirmed', MARGIN + 12, rowY, colW)
  drawField(ctx, 'EXPECTED COMPLETION', formatDate(action.expected_completion_date), MARGIN + 24 + colW, rowY, colW)
  drawField(ctx, 'LAST UPDATED', formatDate(action.updated_at, 'Not available'), MARGIN + 36 + colW * 2, rowY, colW)

  const updateText = action.comment && action.comment !== action.description ? action.comment : ''
  if (updateText) {
    drawWrappedText(page, `Update: ${safeText(updateText)}`, {
      x: MARGIN + 12,
      y: cardBottom + 20,
      width: width - 24,
      font: fonts.regular,
      size: 9,
      color: hexToRgb(TEXT),
      lineHeight: 11,
      maxLines: 2,
    })
  }

  ctx.y = cardBottom - 16
}

export async function buildRepairsUpdatePdf({ inspection, actions }) {
  const { pdfDoc, fonts } = await createStandardPdfDocument()
  const logoImage = await loadLogoImage(pdfDoc)
  const ctx = { pdfDoc, fonts, logoImage, page: null, y: A4[1] - MARGIN }
  addPage(ctx)

  const width = A4[0] - MARGIN * 2
  const locationLine = inspection.estate_block_name || inspection.location_label || inspection.title || 'Estate / block'
  const inspectionDate = formatDate(inspection.submitted_at || inspection.created_at, 'Not available')

  ctx.page.drawText('Estate Inspection Repairs Update', {
    x: MARGIN,
    y: ctx.y,
    size: 22,
    font: fonts.bold,
    color: hexToRgb(TEXT),
  })
  ctx.y -= 30
  ctx.y = drawWrappedText(ctx.page, safeText(locationLine), {
    x: MARGIN,
    y: ctx.y,
    width,
    font: fonts.bold,
    size: 13,
    color: hexToRgb(BLUE),
    lineHeight: 16,
    maxLines: 2,
  })
  ctx.page.drawText(`Inspection date: ${inspectionDate}`, {
    x: MARGIN,
    y: ctx.y - 4,
    size: 10,
    font: fonts.regular,
    color: hexToRgb(MUTED),
  })
  ctx.y -= 34

  ctx.page.drawRectangle({ x: MARGIN, y: ctx.y - 26, width, height: 26, color: hexToRgb(BLUE) })
  ctx.page.drawText('Highlighted Repairs', {
    x: MARGIN + 12,
    y: ctx.y - 18,
    size: 13,
    font: fonts.bold,
    color: rgb(1, 1, 1),
  })
  ctx.y -= 46

  const list = Array.isArray(actions) ? actions : []
  if (list.length === 0) {
    ctx.page.drawText('No repair actions are currently recorded for this inspection.', {
      x: MARGIN,
      y: ctx.y,
      size: 12,
      font: fonts.regular,
      color: hexToRgb(TEXT),
    })
  } else {
    for (let i = 0; i < list.length; i += 1) {
      await drawAction(ctx, list[i], i)
    }
  }

  ctx.page.drawText('This notice is based on the latest available repair action updates.', {
    x: MARGIN,
    y: MARGIN - 8,
    size: 8,
    font: fonts.italic,
    color: hexToRgb(MUTED),
  })

  return Buffer.from(await pdfDoc.save())
}
