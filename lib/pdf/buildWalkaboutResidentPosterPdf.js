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
const BLUE = '#005EB8'
const PURPLE = '#6F2C91'
const DARK = '#111827'
const MUTED = '#374151'
const BORDER = '#B8C2CC'
const TABLE_HEAD = '#EDE7F6'
const PHOTO_BG = '#FFFFFF'
const ROW_SHADE = '#FBFAFF'
const PHOTO_COL_WIDTH = 168
const MAX_IMAGE_WIDTH = 900
const JPEG_QUALITY = 72
const LABEL_COLUMN_RATIO = 0.38
const LABEL_COLUMN_GAP = 12
const MIN_LABEL_WIDTH = 116
const MAX_LABEL_WIDTH = 138
const LABEL_FONT_SIZE = 7.8
const LABEL_LINE_HEIGHT = 9.4
const DETAIL_FONT_SIZE = 9.4
const DETAIL_LINE_HEIGHT = 11.4

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

function readableIssueFromJson(value) {
  if (!value || typeof value !== 'object') return ''
  if (Array.isArray(value)) {
    return value
      .map((entry) => readableIssueFromJson(entry))
      .filter(Boolean)
      .join('; ')
  }
  return String(value.description || value.comment || value.action_summary || value.summary || '').trim()
}

function cleanIssueText(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''

  if (
    (raw.startsWith('[') && raw.endsWith(']')) ||
    (raw.startsWith('{') && raw.endsWith('}'))
  ) {
    try {
      return readableIssueFromJson(JSON.parse(raw))
    } catch {
      return ''
    }
  }

  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const itemMatch = line.match(/^item\s*:\s*(.+)$/i)
      return itemMatch ? itemMatch[1].trim() : line
    })
    .filter((text) => (
      text &&
      !/^inspection\s*:/i.test(text) &&
      !/^estate\s*\/\s*area\s*:/i.test(text) &&
      !/^status\s*:/i.test(text) &&
      !/^action summary\s*:/i.test(text) &&
      !/^id\s*:/i.test(text) &&
      !/^photo_urls?\s*:/i.test(text) &&
      !/^photos?\s*:/i.test(text) &&
      !/^https?:\/\//i.test(text) &&
      !/^\[?\s*\{/.test(text)
    ))
    .join('\n')
    .trim()
}

function issueTextForItem(item) {
  const candidates = [
    item.item_text,
    item.description,
    item.comment,
    item.action_summary,
    item.summary,
    item.title,
    item.question,
  ]
  for (const candidate of candidates) {
    const clean = cleanIssueText(candidate)
    if (clean) return safeText(clean)
  }
  return ''
}

function updateTextForItem(item) {
  const issueText = issueTextForItem(item)
  const candidates = [
    item.action_update,
    item.actionSummary,
    item.action_summary,
    item.comment,
    item.summary,
  ]
  for (const candidate of candidates) {
    const clean = cleanIssueText(candidate)
    if (clean && clean !== issueText) return safeText(clean)
  }
  return ''
}

function normalizePosterText(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function hasUsefulPosterContent(item, inspection) {
  const issue = issueTextForItem(item)
  const update = updateTextForItem(item)
  const jobNumber = String(item.job_number || '').trim()
  const expectedDate = String(item.expected_completion_date || '').trim()
  const location = String(item.location || '').trim()
  const inheritedLocations = new Set(
    [
      inspection?.location_label,
      inspection?.estate_block_name,
      inspection?.title,
    ]
      .map(normalizePosterText)
      .filter(Boolean)
  )
  const hasSpecificLocation = location && !inheritedLocations.has(normalizePosterText(location))
  const status = normalizePosterText(item.status)
  const hasMeaningfulStatus = status && !['open', 'to be confirmed'].includes(status)

  return Boolean(issue || update || hasSpecificLocation || jobNumber || expectedDate || hasMeaningfulStatus)
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
      color: hexToRgb(PURPLE),
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
  ctx.page.drawRectangle({ x: 0, y: 0, width: A4[0], height: A4[1], color: rgb(1, 1, 1) })
  ctx.y = A4[1] - MARGIN
  drawPageHeader(ctx)
}

function drawPageHeader(ctx) {
  const { page, fonts } = ctx
  const contentWidth = A4[0] - MARGIN * 2
  const headerHeight = 78
  const headerTop = ctx.y + 6
  const headerBottom = headerTop - headerHeight
  page.drawRectangle({
    x: MARGIN,
    y: headerBottom,
    width: contentWidth,
    height: headerHeight,
    color: hexToRgb(BLUE),
  })
  page.drawRectangle({
    x: MARGIN + 12,
    y: headerBottom + 14,
    width: 160,
    height: 50,
    color: rgb(1, 1, 1),
    borderColor: rgb(1, 1, 1),
    borderWidth: 1,
  })
  const logoWidth = drawLogo(ctx, MARGIN + 18, headerTop - 16, 148, 38)
  const titleX = MARGIN + Math.max(logoWidth + 40, 198)

  page.drawText('Walkabout Resident Poster', {
    x: titleX,
    y: headerTop - 30,
    size: 20,
    font: fonts.bold,
    color: rgb(1, 1, 1),
  })
  page.drawText('Resident noticeboard update', {
    x: titleX,
    y: headerTop - 50,
    size: 11,
    font: fonts.regular,
    color: rgb(1, 1, 1),
  })
  ctx.y = headerBottom - 18
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
    color: hexToRgb(PURPLE),
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
    borderColor: hexToRgb(PURPLE),
    borderWidth: 1.1,
  })
  page.drawLine({
    start: { x: detailsX, y: ctx.y },
    end: { x: detailsX, y: ctx.y - 24 },
    thickness: 1.1,
    color: hexToRgb(PURPLE),
  })
  page.drawText('PHOTO', { x: MARGIN + 10, y: ctx.y - 16, size: 10.5, font: fonts.bold, color: hexToRgb(PURPLE) })
  page.drawText('DETAILS', { x: detailsX + 10, y: ctx.y - 16, size: 10.5, font: fonts.bold, color: hexToRgb(PURPLE) })
  ctx.y -= 24
}

function drawPlaceholderPhoto(ctx, x, y, width, height) {
  const { page, fonts } = ctx
  page.drawText('No photo', {
    x: x + Math.max(0, (width - 38) / 2),
    y: y - height / 2,
    size: 9,
    font: fonts.italic,
    color: hexToRgb(DARK),
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
    ctx.page.drawRectangle({ x, y: y - height, width, height, color: hexToRgb(PHOTO_BG), borderColor: hexToRgb(BORDER), borderWidth: 1.2 })
    ctx.page.drawImage(image, { x: imageX, y: imageY, width: imageWidth, height: imageHeight })
  } catch {
    drawPlaceholderPhoto(ctx, x, y, width, height)
  }
}

function detailColumns(width) {
  const labelWidth = Math.min(MAX_LABEL_WIDTH, Math.max(MIN_LABEL_WIDTH, width * LABEL_COLUMN_RATIO))
  const valueWidth = Math.max(80, width - labelWidth - LABEL_COLUMN_GAP)
  return { labelWidth, valueWidth }
}

function measureDetailBlockHeight(ctx, label, value, width, maxLines, options = {}) {
  const { labelWidth, valueWidth } = detailColumns(width)
  const valueSize = options.size || DETAIL_FONT_SIZE
  const valueLineHeight = options.lineHeight || DETAIL_LINE_HEIGHT
  const labelLines = Math.min(splitText(`${label}:`, ctx.fonts.bold, LABEL_FONT_SIZE, labelWidth).length, 3)
  const valueLines = Math.min(splitText(value || 'To be confirmed', ctx.fonts.regular, valueSize, valueWidth).length, maxLines)
  return Math.max(labelLines * LABEL_LINE_HEIGHT, valueLines * valueLineHeight)
}

function rowHeightForItem(ctx, item, detailsWidth) {
  const width = detailsWidth - 20
  const contentHeight =
    18 +
    measureDetailBlockHeight(ctx, 'ISSUE', issueTextForItem(item) || 'Walkabout issue raised.', width, 4, {
      size: 10.2,
      lineHeight: 12.2,
    }) +
    6 +
    measureDetailBlockHeight(ctx, 'ACTION / UPDATE', updateTextForItem(item) || 'To be confirmed', width, 2) +
    6 +
    measureDetailBlockHeight(ctx, 'LOCATION', item.location || 'To be confirmed', width, 2) +
    6 +
    measureDetailBlockHeight(ctx, 'REFERENCE/JOB NUMBER', item.job_number || 'To be confirmed', width, 2) +
    6 +
    measureDetailBlockHeight(ctx, 'EXPECTED COMPLETION DATE', formatDate(item.expected_completion_date), width, 2) +
    6 +
    measureDetailBlockHeight(ctx, 'STATUS', formatStatus(item.status), width, 1) +
    14
  return contentHeight
}

function drawDetailLabel(ctx, label, value, x, y, width, maxLines = 2, options = {}) {
  const { page, fonts } = ctx
  const { labelWidth, valueWidth } = detailColumns(width)
  const labelBottom = drawWrappedText(page, `${label}:`, {
    x,
    y,
    width: labelWidth,
    font: fonts.bold,
    size: LABEL_FONT_SIZE,
    color: hexToRgb(PURPLE),
    lineHeight: LABEL_LINE_HEIGHT,
    maxLines: 3,
  })
  const valueBottom = drawWrappedText(page, safeText(value || 'To be confirmed'), {
    x: x + labelWidth + LABEL_COLUMN_GAP,
    y,
    width: valueWidth,
    font: options.boldValue ? fonts.bold : fonts.regular,
    size: options.size || DETAIL_FONT_SIZE,
    color: hexToRgb(DARK),
    lineHeight: options.lineHeight || DETAIL_LINE_HEIGHT,
    maxLines,
  })
  return Math.min(labelBottom, valueBottom) - 4
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
    color: hexToRgb(ROW_SHADE),
    borderColor: hexToRgb(BORDER),
    borderWidth: 1.2,
  })
  page.drawLine({
    start: { x: detailsX, y: top },
    end: { x: detailsX, y: bottom },
    thickness: 1.1,
    color: hexToRgb(BORDER),
  })

  await drawPhotoCell(ctx, item, MARGIN + 10, top - 10, PHOTO_COL_WIDTH - 20, rowHeight - 20)

  let detailY = top - 16
  detailY = drawDetailLabel(ctx, 'ISSUE', issueTextForItem(item) || 'Walkabout issue raised.', detailsX + 10, detailY, detailsWidth - 20, 4, {
    boldValue: true,
    size: 10.2,
    lineHeight: 12.2,
  })
  detailY = drawDetailLabel(ctx, 'ACTION / UPDATE', updateTextForItem(item) || 'To be confirmed', detailsX + 10, detailY, detailsWidth - 20, 2)
  detailY = drawDetailLabel(ctx, 'LOCATION', item.location || 'To be confirmed', detailsX + 10, detailY, detailsWidth - 20, 2)
  detailY = drawDetailLabel(ctx, 'REFERENCE/JOB NUMBER', item.job_number || 'To be confirmed', detailsX + 10, detailY, detailsWidth - 20, 2)
  detailY = drawDetailLabel(ctx, 'EXPECTED COMPLETION DATE', formatDate(item.expected_completion_date), detailsX + 10, detailY, detailsWidth - 20, 2)
  drawDetailLabel(ctx, 'STATUS', formatStatus(item.status), detailsX + 10, detailY, detailsWidth - 20, 1)

  ctx.y = bottom - 10
}

export async function buildWalkaboutResidentPosterPdf({ inspection, items }) {
  const { pdfDoc, fonts } = await createStandardPdfDocument()
  const logoImage = await loadLogoImage(pdfDoc)
  const ctx = { pdfDoc, fonts, logoImage, page: null, y: A4[1] - MARGIN }
  addPage(ctx)

  const posterItems = Array.isArray(items) ? items.filter((item) => hasUsefulPosterContent(item, inspection)) : []
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
    color: hexToRgb(DARK),
  })

  return Buffer.from(await pdfDoc.save())
}
