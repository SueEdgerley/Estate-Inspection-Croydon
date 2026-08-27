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
import {
  CROYDON_HOUSING_LOGO_FILE,
  PDF_LOGO_MAX_HEIGHT,
  PDF_LOGO_MAX_WIDTH,
} from '@/lib/logo-branding'
import { normalizeActionPhotoUrls } from '@/lib/action-photos'

const MARGIN = 32
const FOOTER_H = 24
const PAGE_BOTTOM = FOOTER_H + 10
const PURPLE = '#6F2C91'
const PURPLE_DEEP = '#5A2478'
const PALE = '#F4EEF7'
const PALE_LINE = '#E4D7EC'
const DARK = '#1F2937'
const MUTED = '#4B5563'
const PHOTO_BG = '#F3F0F5'
const CARD_BORDER = '#E5DCEC'
const MAX_IMAGE_WIDTH = 900
const JPEG_QUALITY = 72
const PHOTO_W = 176
const PHOTO_H = 118
const CARD_PAD = 10
const CARD_GAP = 10
const META_W = 124
const NUMBER_SIZE = 16
const FOOTER_EMAIL = 'residentinvolvement@croydon.gov.uk'

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

function photoUrlForItem(item) {
  return normalizeActionPhotoUrls(item.photo_urls)[0] || ''
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

function siteNameForInspection(inspection) {
  return safeText(inspection?.estate_block_name || inspection?.location_label || inspection?.title || 'Estate / block')
}

function addressForInspection(inspection) {
  const site = siteNameForInspection(inspection)
  const location = safeText(inspection?.location_label || '')
  if (location && normalizePosterText(location) !== normalizePosterText(site)) return location
  return site
}

function raisedByForItem(item, inspection) {
  return safeText(
    item?.raisedBy ||
    item?.raised_by ||
    inspection?.inspector_name ||
    inspection?.inspector_id ||
    'To be confirmed'
  ) || 'To be confirmed'
}

function statusBadge(value) {
  const key = normalizePosterText(value)
  if (key === 'completed' || key === 'complete' || key === 'closed' || key === 'done') {
    return { label: 'COMPLETED', bg: '#DCFCE7', fg: '#166534' }
  }
  if (key.includes('progress')) {
    return { label: 'IN PROGRESS', bg: '#FEF3C7', fg: '#92400E' }
  }
  return { label: formatStatus(value || 'Open').toUpperCase(), bg: '#DBEAFE', fg: '#1E40AF' }
}

function drawRoundRect(page, opts) {
  const { x, y, width, height, color, borderColor, borderWidth = 0, radius = 8 } = opts
  page.drawRectangle({
    x,
    y,
    width,
    height,
    color,
    borderColor,
    borderWidth: borderWidth || undefined,
    borderRadius: radius,
  })
}

async function loadLogoImage(pdfDoc) {
  try {
    const logoPath = path.join(process.cwd(), 'public', CROYDON_HOUSING_LOGO_FILE)
    if (!fs.existsSync(logoPath)) return null
    const { data, info } = await sharp(fs.readFileSync(logoPath), { density: 300 })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    for (let i = 0; i < data.length; i += 4) {
      const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3
      const spread = Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2])
      if (brightness > 245 && spread < 20) {
        data[i + 3] = 0
        continue
      }
      const darkness = 1 - brightness / 255
      data[i] = 255
      data[i + 1] = 255
      data[i + 2] = 255
      data[i + 3] = Math.round(data[i + 3] * Math.min(1, darkness * 1.45))
    }
    const png = await sharp(data, {
      raw: { width: info.width, height: info.height, channels: 4 },
    })
      .trim()
      .png()
      .toBuffer()
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

function logoSize(ctx, maxWidth, maxHeight) {
  if (!ctx.logoImage) return { width: Math.min(120, maxWidth), height: 14 }
  const scale = Math.min(maxWidth / ctx.logoImage.width, maxHeight / ctx.logoImage.height, 1)
  return {
    width: ctx.logoImage.width * scale,
    height: ctx.logoImage.height * scale,
  }
}

function drawLogo(ctx, x, y, maxWidth, maxHeight) {
  const { page, logoImage, fonts } = ctx
  const size = logoSize(ctx, maxWidth, maxHeight)
  if (!logoImage) {
    page.drawText('Croydon Housing', {
      x,
      y: y + 2,
      size: 11,
      font: fonts.bold,
      color: rgb(1, 1, 1),
    })
    return size
  }
  page.drawImage(logoImage, { x, y, width: size.width, height: size.height })
  return size
}

function drawPageHeader(ctx, { continuation = false } = {}) {
  const { page, fonts } = ctx
  const headerHeight = continuation ? 62 : 74
  const headerBottom = A4[1] - headerHeight
  page.drawRectangle({
    x: 0,
    y: headerBottom,
    width: A4[0],
    height: headerHeight,
    color: hexToRgb(PURPLE),
  })
  const logoMaxH = continuation ? 34 : PDF_LOGO_MAX_HEIGHT
  const size = logoSize(ctx, PDF_LOGO_MAX_WIDTH, logoMaxH)
  const logoY = headerBottom + (headerHeight - size.height) / 2
  drawLogo(ctx, 20, logoY, PDF_LOGO_MAX_WIDTH, logoMaxH)
  const titleX = 20 + size.width + 20
  const titleSize = continuation ? 12.5 : 14.5
  const subtitleSize = 8
  const titleGap = 6
  const titleBlockH = titleSize + titleGap + subtitleSize
  const titleBlockBottom = headerBottom + (headerHeight - titleBlockH) / 2
  page.drawText('WALKABOUT RESIDENT POSTER', {
    x: titleX,
    y: titleBlockBottom + subtitleSize + titleGap,
    size: titleSize,
    font: fonts.bold,
    color: rgb(1, 1, 1),
  })
  page.drawText('Keeping your estate safe, clean and well maintained.', {
    x: titleX,
    y: titleBlockBottom,
    size: subtitleSize,
    font: fonts.regular,
    color: rgb(1, 1, 1),
  })
  ctx.y = headerBottom - 16
}

function drawPinIcon(page, x, y, color) {
  page.drawCircle({ x: x + 3.5, y: y + 5.2, size: 3.2, borderColor: color, borderWidth: 1.1 })
  page.drawLine({ start: { x: x + 3.5, y: y + 2.2 }, end: { x: x + 3.5, y: y - 0.4 }, thickness: 1.1, color })
}

function drawCalendarIcon(page, x, y, color) {
  page.drawRectangle({ x, y, width: 8, height: 7, borderColor: color, borderWidth: 1 })
  page.drawLine({ start: { x: x + 2, y: y + 7.6 }, end: { x: x + 2, y: y + 5.6 }, thickness: 1, color })
  page.drawLine({ start: { x: x + 6, y: y + 7.6 }, end: { x: x + 6, y: y + 5.6 }, thickness: 1, color })
}

function drawClockIcon(page, x, y, color) {
  page.drawCircle({ x: x + 4, y: y + 4, size: 4, borderColor: color, borderWidth: 1.1 })
  page.drawLine({ start: { x: x + 4, y: y + 4 }, end: { x: x + 4, y: y + 6.4 }, thickness: 1, color })
  page.drawLine({ start: { x: x + 4, y: y + 4 }, end: { x: x + 6, y: y + 4 }, thickness: 1, color })
}

function drawDocIcon(page, x, y, color) {
  page.drawRectangle({ x, y, width: 6.5, height: 8, borderColor: color, borderWidth: 1 })
  page.drawLine({ start: { x: x + 1.4, y: y + 5.6 }, end: { x: x + 5.1, y: y + 5.6 }, thickness: 0.8, color })
  page.drawLine({ start: { x: x + 1.4, y: y + 3.8 }, end: { x: x + 5.1, y: y + 3.8 }, thickness: 0.8, color })
}

function drawPersonIcon(page, x, y, color) {
  page.drawCircle({ x: x + 3.5, y: y + 6.2, size: 1.8, borderColor: color, borderWidth: 1 })
  page.drawRectangle({ x: x + 0.8, y: y, width: 5.4, height: 3.6, borderColor: color, borderWidth: 1, borderRadius: 1.5 })
}

function drawEnvelopeIcon(page, x, y, color) {
  page.drawRectangle({ x, y, width: 11, height: 7.5, borderColor: color, borderWidth: 1 })
  page.drawLine({ start: { x, y: y + 7.5 }, end: { x: x + 5.5, y: y + 3.4 }, thickness: 1, color })
  page.drawLine({ start: { x: x + 11, y: y + 7.5 }, end: { x: x + 5.5, y: y + 3.4 }, thickness: 1, color })
}

function drawMegaphoneIcon(page, x, y, color) {
  page.drawCircle({ x: x + 5, y: y + 6, size: 5.5, color: hexToRgb(PALE), borderColor: color, borderWidth: 1 })
  page.drawLine({ start: { x: x + 2.4, y: y + 6 }, end: { x: x + 7.6, y: y + 8.2 }, thickness: 1.2, color })
  page.drawLine({ start: { x: x + 2.4, y: y + 6 }, end: { x: x + 7.6, y: y + 3.8 }, thickness: 1.2, color })
}

function drawSpeechIcon(page, x, y, color) {
  page.drawRectangle({
    x,
    y: y + 2,
    width: 11,
    height: 8,
    borderColor: color,
    borderWidth: 1,
    borderRadius: 2,
  })
  page.drawLine({ start: { x: x + 3, y: y + 2 }, end: { x: x + 2, y: y }, thickness: 1, color })
}

function addPage(ctx, { continuation = false } = {}) {
  ctx.page = ctx.pdfDoc.addPage(A4)
  ctx.page.drawRectangle({ x: 0, y: 0, width: A4[0], height: A4[1], color: rgb(1, 1, 1) })
  drawFooter(ctx)
  drawPageHeader(ctx, { continuation })
}

function drawFooter(ctx) {
  const { page, fonts } = ctx
  page.drawRectangle({
    x: 0,
    y: 0,
    width: A4[0],
    height: FOOTER_H,
    color: hexToRgb(PURPLE),
  })
  const label = FOOTER_EMAIL
  const textWidth = fonts.regular.widthOfTextAtSize(label, 8)
  const totalWidth = 14 + textWidth
  const startX = (A4[0] - totalWidth) / 2
  drawEnvelopeIcon(page, startX, 8.2, rgb(1, 1, 1))
  page.drawText(label, {
    x: startX + 14,
    y: 9,
    size: 8,
    font: fonts.regular,
    color: rgb(1, 1, 1),
  })
}

function drawSiteBlock(ctx, inspection, items) {
  const { page, fonts } = ctx
  const contentWidth = A4[0] - MARGIN * 2
  const siteName = siteNameForInspection(inspection)
  const address = addressForInspection(inspection)
  const latestUpdate = items
    .map((item) => item.updated_at || item.created_at)
    .filter(Boolean)
    .sort((a, b) => new Date(b) - new Date(a))[0]
  const walkaboutDate = formatDate(inspection.submitted_at || inspection.created_at, 'Not available')
  const generatedDate = formatDate(latestUpdate || new Date(), 'Not available')
  const dateColW = 168
  const nameWidth = contentWidth - dateColW - 12

  ctx.y = drawWrappedText(page, siteName, {
    x: MARGIN,
    y: ctx.y,
    width: nameWidth,
    font: fonts.bold,
    size: 16,
    color: hexToRgb(PURPLE),
    lineHeight: 19,
    maxLines: 2,
  })
  if (normalizePosterText(address) !== normalizePosterText(siteName)) {
    ctx.y -= 4
    drawPinIcon(page, MARGIN, ctx.y - 2, hexToRgb(PURPLE))
    ctx.y = drawWrappedText(page, address, {
      x: MARGIN + 12,
      y: ctx.y,
      width: nameWidth - 12,
      font: fonts.regular,
      size: 8.5,
      color: hexToRgb(MUTED),
      lineHeight: 11,
      maxLines: 2,
    })
  }

  const dateTop = A4[1] - 74 - 22
  const dividerX = A4[0] - MARGIN - dateColW + 78
  page.drawLine({
    start: { x: dividerX, y: dateTop + 16 },
    end: { x: dividerX, y: dateTop - 18 },
    thickness: 0.7,
    color: hexToRgb(PALE_LINE),
  })
  drawCalendarIcon(page, A4[0] - MARGIN - dateColW, dateTop + 8, hexToRgb(PURPLE))
  page.drawText('Walkabout date', {
    x: A4[0] - MARGIN - dateColW + 12,
    y: dateTop + 10,
    size: 7,
    font: fonts.bold,
    color: hexToRgb(MUTED),
  })
  page.drawText(walkaboutDate, {
    x: A4[0] - MARGIN - dateColW + 12,
    y: dateTop - 2,
    size: 9.5,
    font: fonts.bold,
    color: hexToRgb(DARK),
  })
  drawClockIcon(page, dividerX + 10, dateTop + 6, hexToRgb(PURPLE))
  page.drawText('Generated/updated', {
    x: dividerX + 22,
    y: dateTop + 10,
    size: 7,
    font: fonts.bold,
    color: hexToRgb(MUTED),
  })
  page.drawText(generatedDate, {
    x: dividerX + 22,
    y: dateTop - 2,
    size: 9.5,
    font: fonts.bold,
    color: hexToRgb(DARK),
  })

  ctx.y = Math.min(ctx.y, dateTop - 22) - 14
}

function drawIntroPanels(ctx) {
  const { page, fonts } = ctx
  const contentWidth = A4[0] - MARGIN * 2
  const gap = 10
  const leftW = Math.round(contentWidth * 0.62)
  const rightW = contentWidth - leftW - gap
  const height = 48
  const bottom = ctx.y - height

  drawRoundRect(page, {
    x: MARGIN,
    y: bottom,
    width: leftW,
    height,
    color: hexToRgb(PALE),
    radius: 8,
  })
  drawMegaphoneIcon(page, MARGIN + 10, bottom + 18, hexToRgb(PURPLE))
  page.drawText("We're working on the following.", {
    x: MARGIN + 28,
    y: bottom + 30,
    size: 8.5,
    font: fonts.bold,
    color: hexToRgb(PURPLE_DEEP),
  })
  drawWrappedText(page, "Thank you to residents for raising these issues during our walkabout. Here's what we're doing.", {
    x: MARGIN + 28,
    y: bottom + 18,
    width: leftW - 38,
    font: fonts.regular,
    size: 7.6,
    color: hexToRgb(MUTED),
    lineHeight: 9.4,
    maxLines: 2,
  })

  drawRoundRect(page, {
    x: MARGIN + leftW + gap,
    y: bottom,
    width: rightW,
    height,
    color: hexToRgb(PALE),
    radius: 8,
  })
  drawSpeechIcon(page, MARGIN + leftW + gap + 10, bottom + 18, hexToRgb(PURPLE))
  page.drawText('Got feedback?', {
    x: MARGIN + leftW + gap + 28,
    y: bottom + 30,
    size: 8.5,
    font: fonts.bold,
    color: hexToRgb(PURPLE_DEEP),
  })
  drawWrappedText(page, 'Let us know by speaking to your Neighbourhood Officer.', {
    x: MARGIN + leftW + gap + 28,
    y: bottom + 18,
    width: rightW - 38,
    font: fonts.regular,
    size: 7.6,
    color: hexToRgb(MUTED),
    lineHeight: 9.4,
    maxLines: 2,
  })

  ctx.y = bottom - 14
}

function drawContinuationContext(ctx, inspection) {
  const { page, fonts } = ctx
  page.drawText(siteNameForInspection(inspection), {
    x: MARGIN,
    y: ctx.y,
    size: 11,
    font: fonts.bold,
    color: hexToRgb(PURPLE),
  })
  page.drawText('Continued', {
    x: A4[0] - MARGIN - 52,
    y: ctx.y,
    size: 9,
    font: fonts.italic,
    color: hexToRgb(MUTED),
  })
  ctx.y -= 14
}

function titleWidth() {
  const contentWidth = A4[0] - MARGIN * 2
  const innerW = contentWidth - CARD_PAD * 2
  return innerW - NUMBER_SIZE - 6 - PHOTO_W - 10 - META_W - 8
}

function cardHeightForItem(ctx, item) {
  const title = issueTextForItem(item) || 'Walkabout issue raised.'
  const action = updateTextForItem(item) || 'To be confirmed'
  const titleLines = Math.min(splitText(title, ctx.fonts.bold, 11.5, titleWidth()).length, 3)
  const actionLines = Math.min(splitText(action, ctx.fonts.regular, 8.6, titleWidth()).length, 4)
  const midHeight = titleLines * 14 + 16 + actionLines * 11 + 8
  const metaHeight = 78
  return CARD_PAD * 2 + Math.max(PHOTO_H, midHeight, metaHeight)
}

function drawMetaRow(ctx, icon, label, value, x, y, width) {
  const { page, fonts } = ctx
  icon(page, x, y - 1, hexToRgb(PURPLE))
  page.drawText(label, {
    x: x + 12,
    y: y + 1,
    size: 6.2,
    font: fonts.bold,
    color: hexToRgb(MUTED),
  })
  return drawWrappedText(page, value || 'To be confirmed', {
    x: x + 12,
    y: y - 10,
    width: width - 12,
    font: fonts.regular,
    size: 8,
    color: hexToRgb(DARK),
    lineHeight: 10,
    maxLines: 2,
  })
}

async function drawCardPhoto(ctx, item, x, y, width, height) {
  const { page } = ctx
  drawRoundRect(page, {
    x,
    y: y - height,
    width,
    height,
    color: hexToRgb(PHOTO_BG),
    borderColor: hexToRgb(PALE_LINE),
    borderWidth: 0.6,
    radius: 6,
  })
  const url = photoUrlForItem(item)
  if (!url) return

  const buffer = await imageBufferFromUrl(url)
  if (!buffer) return
  try {
    const image = await ctx.pdfDoc.embedJpg(buffer)
    const inset = 3
    const boxW = width - inset * 2
    const boxH = height - inset * 2
    const scale = Math.min(boxW / image.width, boxH / image.height)
    const drawW = image.width * scale
    const drawH = image.height * scale
    page.drawImage(image, {
      x: x + inset + (boxW - drawW) / 2,
      y: y - height + inset + (boxH - drawH) / 2,
      width: drawW,
      height: drawH,
    })
  } catch (error) {
    console.warn('[walkabout-resident-poster-pdf] photo embed skipped:', error?.message || error)
  }
}

function drawStatusBadge(ctx, status, right, top) {
  const { page, fonts } = ctx
  const badge = statusBadge(status)
  const label = badge.label
  const padX = 6
  const width = fonts.bold.widthOfTextAtSize(label, 6.6) + padX * 2
  const height = 12
  drawRoundRect(page, {
    x: right - width,
    y: top - height,
    width,
    height,
    color: hexToRgb(badge.bg),
    radius: 6,
  })
  page.drawText(label, {
    x: right - width + padX,
    y: top - 9,
    size: 6.6,
    font: fonts.bold,
    color: hexToRgb(badge.fg),
  })
}

async function drawPosterCard(ctx, item, index, inspection) {
  const contentWidth = A4[0] - MARGIN * 2
  const height = cardHeightForItem(ctx, item)
  if (ctx.y - height < PAGE_BOTTOM) {
    addPage(ctx, { continuation: true })
    drawContinuationContext(ctx, inspection)
  }

  const { page, fonts } = ctx
  const top = ctx.y
  const bottom = top - height
  drawRoundRect(page, {
    x: MARGIN,
    y: bottom,
    width: contentWidth,
    height,
    color: rgb(1, 1, 1),
    borderColor: hexToRgb(CARD_BORDER),
    borderWidth: 0.9,
    radius: 8,
  })

  const innerX = MARGIN + CARD_PAD
  const innerTop = top - CARD_PAD
  drawRoundRect(page, {
    x: innerX,
    y: innerTop - NUMBER_SIZE,
    width: NUMBER_SIZE,
    height: NUMBER_SIZE,
    color: hexToRgb(PURPLE),
    radius: 3,
  })
  const number = String(index + 1)
  const numW = fonts.bold.widthOfTextAtSize(number, 8)
  page.drawText(number, {
    x: innerX + (NUMBER_SIZE - numW) / 2,
    y: innerTop - 11.5,
    size: 8,
    font: fonts.bold,
    color: rgb(1, 1, 1),
  })

  const photoX = innerX + NUMBER_SIZE + 6
  await drawCardPhoto(ctx, item, photoX, innerTop, PHOTO_W, PHOTO_H)

  const titleX = photoX + PHOTO_W + 10
  const tWidth = titleWidth()
  const title = issueTextForItem(item) || 'Walkabout issue raised.'
  const action = updateTextForItem(item) || 'To be confirmed'
  let textY = innerTop - 2
  textY = drawWrappedText(page, title, {
    x: titleX,
    y: textY,
    width: tWidth,
    font: fonts.bold,
    size: 11.5,
    color: hexToRgb(PURPLE_DEEP),
    lineHeight: 14,
    maxLines: 3,
  })
  textY -= 6
  const tag = "WHAT WE'RE DOING"
  const tagW = fonts.bold.widthOfTextAtSize(tag, 6) + 10
  drawRoundRect(page, {
    x: titleX,
    y: textY - 4,
    width: tagW,
    height: 11,
    color: hexToRgb(PALE),
    radius: 3,
  })
  page.drawText(tag, {
    x: titleX + 5,
    y: textY - 1,
    size: 6,
    font: fonts.bold,
    color: hexToRgb(PURPLE),
  })
  textY -= 14
  drawWrappedText(page, action, {
    x: titleX,
    y: textY,
    width: tWidth,
    font: fonts.regular,
    size: 8.6,
    color: hexToRgb(DARK),
    lineHeight: 11,
    maxLines: 4,
  })

  const metaX = MARGIN + contentWidth - CARD_PAD - META_W
  drawStatusBadge(ctx, item.status, MARGIN + contentWidth - CARD_PAD, innerTop)
  let metaY = innerTop - 18
  metaY = drawMetaRow(ctx, drawPinIcon, 'LOCATION', item.location || siteNameForInspection(inspection), metaX, metaY, META_W) - 8
  metaY = drawMetaRow(ctx, drawDocIcon, 'REFERENCE / JOB NO.', item.job_number || 'To be confirmed', metaX, metaY, META_W) - 8
  metaY = drawMetaRow(ctx, drawCalendarIcon, 'EXPECTED COMPLETION', formatDate(item.expected_completion_date), metaX, metaY, META_W) - 8
  drawMetaRow(ctx, drawPersonIcon, 'RAISED BY', raisedByForItem(item, inspection), metaX, metaY, META_W)

  ctx.y = bottom - CARD_GAP
}

export async function buildWalkaboutResidentPosterPdf({ inspection, items }) {
  const { pdfDoc, fonts } = await createStandardPdfDocument()
  const logoImage = await loadLogoImage(pdfDoc)
  const ctx = { pdfDoc, fonts, logoImage, page: null, y: A4[1] - MARGIN }
  addPage(ctx)

  const posterItems = Array.isArray(items) ? items.filter((item) => hasUsefulPosterContent(item, inspection)) : []
  drawSiteBlock(ctx, inspection, posterItems)
  drawIntroPanels(ctx)

  if (posterItems.length === 0) {
    ctx.page.drawText('No walkabout issues are currently recorded for this inspection.', {
      x: MARGIN,
      y: ctx.y - 20,
      size: 11,
      font: fonts.regular,
      color: hexToRgb(DARK),
    })
  } else {
    for (let index = 0; index < posterItems.length; index += 1) {
      await drawPosterCard(ctx, posterItems[index], index, inspection)
    }
  }

  return Buffer.from(await pdfDoc.save())
}
