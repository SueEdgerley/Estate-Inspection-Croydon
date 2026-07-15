/**
 * One page per issue: resident-facing and operational Estate Action Update sheet.
 * Uses pdf-lib standard fonts so Vercel does not need pdfkit .afm files.
 */

import sharp from 'sharp'
import {
  A4,
  createStandardPdfDocument,
  drawWrappedText,
  hexToRgb,
  rgb,
  safeText,
} from '@/lib/pdf/pdfLibHelpers'

const MAX_PHOTO_WIDTH = 460
const MAX_PHOTO_DISPLAY_H = 220
const JPEG_QUALITY = 0.85

const BRAND = '#0f4c5c'
const BRAND_LIGHT = '#e6f2f0'
const TEXT = '#0f172a'
const MUTED = '#64748b'
const BORDER = '#cbd5e1'

async function imageBufferForEvidence(url) {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    return await sharp(buf)
      .resize(MAX_PHOTO_WIDTH, MAX_PHOTO_DISPLAY_H, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: Math.round(JPEG_QUALITY * 100) })
      .toBuffer()
  } catch {
    return null
  }
}

function drawLabelValue(page, fonts, label, value, x, y, width, valueFont = fonts.regular) {
  page.drawText(safeText(label).toUpperCase(), {
    x,
    y,
    size: 7.5,
    font: fonts.bold,
    color: hexToRgb(MUTED),
  })
  return drawWrappedText(page, value || '-', {
    x,
    y: y - 13,
    width,
    font: valueFont,
    size: 10,
    color: hexToRgb(TEXT),
    lineHeight: 12,
    maxLines: 2,
  })
}

function ruledField(page, fonts, label, x, y, width, lines = 1, lineHeight = 14) {
  page.drawText(safeText(label).toUpperCase(), { x, y, size: 7.5, font: fonts.bold, color: hexToRgb(MUTED) })
  let yy = y - 8
  for (let i = 0; i < lines; i++) {
    const ly = yy - i * lineHeight
    page.drawLine({ start: { x, y: ly }, end: { x: x + width, y: ly }, thickness: 0.4, color: hexToRgb(BORDER) })
  }
  return yy - Math.max(lines, 1) * lineHeight - 8
}

/**
 * @param {{
 *   actionId: string,
 *   inspectionType?: string,
 *   blockEstate?: string,
 *   location?: string,
 *   exactLocation?: string,
 *   dateRaised?: string,
 *   dateSent?: string,
 *   issueTitle?: string,
 *   issueType?: string,
 *   issueDetail?: string,
 *   description?: string,
 *   priority?: string,
 *   assignedTeam?: string,
 *   targetCompletionDate?: string,
 *   jobNumber?: string,
 *   status?: string,
 *   photoUrls?: string[],
 * }} ctx
 * @returns {Promise<Buffer>}
 */
export async function buildIssueJobCardPdfBuffer(ctx) {
  const {
    actionId,
    inspectionType = 'Inspection',
    blockEstate = '',
    location = '',
    exactLocation = '',
    dateRaised = '',
    dateSent = '',
    issueTitle = '',
    issueType = '',
    issueDetail = '',
    description = '',
    priority = '-',
    assignedTeam = '-',
    targetCompletionDate = '-',
    jobNumber = '-',
    status = 'Open',
    photoUrls = [],
  } = ctx

  const { pdfDoc, fonts } = await createStandardPdfDocument()
  const page = pdfDoc.addPage(A4)
  const pageW = A4[0]
  const pageH = A4[1]
  const x = 42
  const innerW = pageW - 84
  let y = pageH - 36

  const descText = safeText(description || issueDetail || '-')
  const typeLabel = safeText(issueType || issueTitle || 'Issue') || 'Issue'
  const whereExact = safeText(exactLocation || location || blockEstate || '-') || '-'
  const blockLine = safeText(blockEstate || location || '-') || '-'
  const sentLine = safeText(dateSent || dateRaised || '-') || '-'
  const actionRef = safeText(actionId || '-') || '-'

  page.drawRectangle({ x: 0, y: pageH - 52, width: pageW, height: 52, color: hexToRgb(BRAND) })
  const title = 'Croydon Housing Estate Action Update'
  page.drawText(title, {
    x: (pageW - fonts.bold.widthOfTextAtSize(title, 17)) / 2,
    y: pageH - 34,
    size: 17,
    font: fonts.bold,
    color: rgb(1, 1, 1),
  })
  y = pageH - 72

  const boxH = 112
  page.drawRectangle({ x, y: y - boxH, width: innerW, height: boxH, color: hexToRgb(BRAND_LIGHT) })
  page.drawRectangle({ x, y: y - boxH, width: innerW, height: boxH, borderColor: hexToRgb(BORDER), borderWidth: 0.5 })
  const colW = (innerW - 34) / 2
  const leftX = x + 10
  const rightX = leftX + colW + 14
  let fieldY = y - 18
  drawLabelValue(page, fonts, 'Block / Estate', blockLine, leftX, fieldY, colW, fonts.bold)
  drawLabelValue(page, fonts, 'Inspection Type', inspectionType || '-', rightX, fieldY, colW)
  fieldY -= 52
  drawLabelValue(page, fonts, 'Date Raised', dateRaised || '-', leftX, fieldY, colW)
  drawLabelValue(page, fonts, 'Action Reference', actionRef, rightX, fieldY, colW)
  y -= boxH + 18

  page.drawText('Issue', { x, y, size: 10, font: fonts.bold, color: hexToRgb(BRAND) })
  y -= 8
  page.drawLine({ start: { x, y }, end: { x: x + innerW, y }, thickness: 0.6, color: hexToRgb(BORDER) })
  y -= 16

  const half = (innerW - 10) / 2
  drawLabelValue(page, fonts, 'Issue Type', typeLabel, x, y, half, fonts.bold)
  drawLabelValue(page, fonts, 'Priority', priority || '-', x + half + 10, y, half)
  y -= 42
  y = drawLabelValue(page, fonts, 'Exact Location', whereExact, x, y, innerW) - 8

  page.drawText('DESCRIPTION', { x, y, size: 7.5, font: fonts.bold, color: hexToRgb(MUTED) })
  y -= 13
  y = drawWrappedText(page, descText, {
    x,
    y,
    width: innerW,
    font: fonts.regular,
    size: 10,
    color: hexToRgb(TEXT),
    lineHeight: 12,
    maxLines: 8,
  }) - 10

  const urls = (photoUrls || []).filter((u) => typeof u === 'string' && u.trim())
  page.drawText(urls.length <= 1 ? 'Evidence photo' : `Evidence photos (${urls.length})`, {
    x,
    y,
    size: 10,
    font: fonts.bold,
    color: hexToRgb(BRAND),
  })
  y -= 14
  if (urls.length > 0) {
    const gap = 8
    const cols = urls.length === 1 ? 1 : Math.min(2, urls.length)
    const thumbMaxW = cols === 1 ? Math.min(MAX_PHOTO_WIDTH, innerW) : Math.floor((innerW - gap) / cols)
    const thumbMaxH = cols === 1 ? MAX_PHOTO_DISPLAY_H : Math.min(MAX_PHOTO_DISPLAY_H, 160)

    let idx = 0
    let anyDrawn = false
    while (idx < urls.length) {
      const rowCount = Math.min(cols, urls.length - idx)
      let rowMaxH = 0
      const placed = []
      for (let c = 0; c < rowCount; c++) {
        const imgBuf = await imageBufferForEvidence(urls[idx + c])
        if (!imgBuf) continue
        try {
          const img = await pdfDoc.embedJpg(imgBuf)
          const scale = Math.min(thumbMaxW / img.width, thumbMaxH / img.height, 1)
          const w = img.width * scale
          const h = img.height * scale
          placed.push({ img, w, h, col: c })
          rowMaxH = Math.max(rowMaxH, h)
        } catch {
          // skip broken image
        }
      }
      if (placed.length === 0) {
        page.drawText('(Photo unavailable for print.)', { x, y, size: 9, font: fonts.regular, color: hexToRgb(MUTED) })
        y -= 14
        idx += rowCount
        continue
      }
      if (y - rowMaxH < 80) {
        // Keep remaining photos on this page if possible; otherwise clip note
        page.drawText('(Further photos omitted — page full.)', { x, y, size: 8, font: fonts.italic, color: hexToRgb(MUTED) })
        y -= 12
        break
      }
      for (const item of placed) {
        const px = x + item.col * (thumbMaxW + gap)
        page.drawImage(item.img, { x: px, y: y - item.h, width: item.w, height: item.h })
        anyDrawn = true
      }
      y -= rowMaxH + gap
      idx += rowCount
    }
    if (!anyDrawn) {
      page.drawText('(Photo unavailable for print.)', { x, y, size: 9, font: fonts.regular, color: hexToRgb(MUTED) })
      y -= 14
    }
  } else {
    page.drawText('No photo attached to this issue.', { x, y, size: 9, font: fonts.italic, color: hexToRgb(MUTED) })
    y -= 14
  }

  y = Math.min(y - 8, 420)
  page.drawText('Action', { x, y, size: 10, font: fonts.bold, color: hexToRgb(BRAND) })
  y -= 8
  page.drawLine({ start: { x, y }, end: { x: x + innerW, y }, thickness: 0.6, color: hexToRgb(BORDER) })
  y -= 16

  const qCol = innerW / 4 - 4
  const fields = [
    ['Assigned team', assignedTeam || '-'],
    ['Date sent', sentLine],
    ['Target completion', String(targetCompletionDate || '-')],
    ['Job number', String(jobNumber || '-')],
  ]
  let fx = x
  fields.forEach(([label, value]) => {
    drawLabelValue(page, fonts, label, value, fx, y, qCol)
    fx += qCol + 5
  })
  y -= 48

  y = drawWrappedText(page, 'We are looking into this and will update you when work is planned or completed.', {
    x,
    y,
    width: innerW,
    font: fonts.regular,
    size: 9,
    color: hexToRgb(TEXT),
  }) - 12

  page.drawText('Completion (operational use)', { x, y, size: 10, font: fonts.bold, color: hexToRgb(BRAND) })
  y -= 18
  y = ruledField(page, fonts, 'Attended by', x, y, innerW, 1)
  y = ruledField(page, fonts, 'Date attended', x, y, innerW, 1)
  y = ruledField(page, fonts, 'Work completed', x, y, innerW, 2)
  y = ruledField(page, fonts, 'Further action required', x, y, innerW, 2)

  const footTop = Math.max(52, y - 4)
  page.drawRectangle({ x, y: footTop, width: innerW, height: 22, color: hexToRgb('#f8fafc') })
  page.drawText(`Status: ${safeText(status)}`, { x: x + 8, y: footTop + 7, size: 9, font: fonts.bold, color: hexToRgb(TEXT) })
  const footer = 'Thank you for reporting this issue.'
  page.drawText(footer, {
    x: (pageW - fonts.italic.widthOfTextAtSize(footer, 9)) / 2,
    y: 28,
    size: 9,
    font: fonts.italic,
    color: hexToRgb(MUTED),
  })

  return Buffer.from(await pdfDoc.save())
}
