/**
 * One page per issue — resident-facing & operational “Estate Action Update” sheet.
 * Not the full inspection layout.
 */

import PDFDocument from 'pdfkit'
import sharp from 'sharp'

const MAX_PHOTO_WIDTH = 460
const MAX_PHOTO_DISPLAY_H = 220
const JPEG_QUALITY = 0.85

const BRAND = '#0f4c5c'
const BRAND_LIGHT = '#e6f2f0'
const TEXT = '#0f172a'
const MUTED = '#64748b'
const BORDER = '#cbd5e1'

/** @param {string} url */
async function imageBufferForEvidence(url) {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    const meta = await sharp(buf).metadata()
    return await sharp(buf)
      .resize(MAX_PHOTO_WIDTH, MAX_PHOTO_DISPLAY_H, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: Math.round(JPEG_QUALITY * 100) })
      .toBuffer()
  } catch {
    return null
  }
}

function ruledField(doc, label, x, y, width, lines = 1, lineHeight = 14) {
  doc.fontSize(7.5).fillColor(MUTED).font('Helvetica-Bold').text(label.toUpperCase(), x, y, { width })
  let yy = doc.y + 2
  doc.save().strokeColor(BORDER).lineWidth(0.4)
  const h = Math.max(lines, 1) * lineHeight
  for (let i = 0; i < lines; i++) {
    const ly = yy + i * lineHeight
    doc.moveTo(x, ly).lineTo(x + width, ly).stroke()
  }
  doc.restore()
  return yy + h + 8
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
    priority = '—',
    assignedTeam = '—',
    targetCompletionDate = '—',
    jobNumber = '—',
    status = 'Open',
    photoUrls = [],
  } = ctx

  const descText = String(description || issueDetail || '').trim()
  const typeLabel = String(issueType || issueTitle || 'Issue').trim() || 'Issue'
  const whereExact = String(exactLocation || location || blockEstate || '').trim() || '—'
  const blockLine = String(blockEstate || location || '—').trim() || '—'
  const sentLine = String(dateSent || dateRaised || '—').trim() || '—'
  const actionRef = String(actionId || '—').trim()

  const doc = new PDFDocument({ size: 'A4', margin: 42 })
  const chunks = []
  doc.on('data', (c) => chunks.push(c))

  const pageW = doc.page.width
  const innerW = pageW - 84
  let x = 42
  let y = 36

  // Top banner
  doc.save().fillColor(BRAND).rect(0, 0, pageW, 52).fill().restore()
  doc.fontSize(17).fillColor('#ffffff').font('Helvetica-Bold').text('Croydon Housing Estate Action Update', x, 18, {
    width: innerW,
    align: 'center',
  })
  y = 62

  // Key fields — 2×2 grid
  const colW = (innerW - 14) / 2
  const rowH = 52
  doc.save().fillColor(BRAND_LIGHT).roundedRect(x, y, innerW, rowH * 2 + 8, 4).fill().restore()
  doc.save().strokeColor(BORDER).lineWidth(0.5).roundedRect(x, y, innerW, rowH * 2 + 8, 4).stroke().restore()

  const pad = 10
  let bx = x + pad
  let by = y + pad
  doc.fontSize(7.5).fillColor(MUTED).font('Helvetica-Bold').text('BLOCK / ESTATE', bx, by, { width: colW })
  doc.fontSize(11).fillColor(TEXT).font('Helvetica-Bold').text(blockLine, bx, by + 12, { width: colW - 4 })

  const bx2 = bx + colW + 14
  doc.fontSize(7.5).fillColor(MUTED).font('Helvetica-Bold').text('INSPECTION TYPE', bx2, by, { width: colW })
  doc.fontSize(11).fillColor(TEXT).font('Helvetica').text(inspectionType || '—', bx2, by + 12, { width: colW - 4 })

  by += rowH
  doc.fontSize(7.5).fillColor(MUTED).font('Helvetica-Bold').text('DATE RAISED', bx, by, { width: colW })
  doc.fontSize(11).fillColor(TEXT).font('Helvetica').text(dateRaised || '—', bx, by + 12, { width: colW - 4 })

  doc.fontSize(7.5).fillColor(MUTED).font('Helvetica-Bold').text('ACTION REFERENCE', bx2, by, { width: colW })
  doc.fontSize(actionRef.length > 52 ? 7.5 : 9).fillColor(TEXT).font('Helvetica').text(actionRef, bx2, by + 12, {
    width: colW - 4,
    lineGap: 1,
  })

  y += rowH * 2 + 18

  // Section: Issue
  doc.fontSize(10).fillColor(BRAND).font('Helvetica-Bold').text('Issue', x, y)
  y = doc.y + 6
  doc.save().strokeColor(BORDER).lineWidth(0.6).moveTo(x, y).lineTo(x + innerW, y).stroke().restore()
  y += 10

  const half = (innerW - 10) / 2
  doc.fontSize(7.5).fillColor(MUTED).font('Helvetica-Bold').text('ISSUE TYPE', x, y, { width: half })
  doc.fontSize(10).fillColor(TEXT).font('Helvetica-Bold').text(typeLabel, x, y + 11, { width: half })
  doc.fontSize(7.5).fillColor(MUTED).font('Helvetica-Bold').text('PRIORITY', x + half + 10, y, { width: half })
  doc.fontSize(10).fillColor(TEXT).font('Helvetica').text(String(priority || '—'), x + half + 10, y + 11, { width: half })
  y += 36

  doc.fontSize(7.5).fillColor(MUTED).font('Helvetica-Bold').text('EXACT LOCATION', x, y, { width: innerW })
  y = doc.y + 2
  doc.fontSize(10).fillColor(TEXT).font('Helvetica').text(whereExact, x, y, { width: innerW })
  y = doc.y + 10

  doc.fontSize(7.5).fillColor(MUTED).font('Helvetica-Bold').text('DESCRIPTION', x, y, { width: innerW })
  y = doc.y + 2
  doc.fontSize(10).fillColor(TEXT).font('Helvetica').text(descText || '—', x, y, {
    width: innerW,
    lineGap: 2,
    height: 118,
    ellipsis: true,
  })
  y = Math.min(doc.y + 8, 320)

  // Photo — large evidence
  const urls = (photoUrls || []).filter((u) => typeof u === 'string' && u.trim())
  doc.fontSize(10).fillColor(BRAND).font('Helvetica-Bold').text('Evidence photo', x, y)
  y = doc.y + 6
  if (urls.length > 0) {
    const imgBuf = await imageBufferForEvidence(urls[0])
    if (imgBuf) {
      try {
        const imgW = Math.min(MAX_PHOTO_WIDTH, innerW)
        doc.image(imgBuf, x, y, { fit: [imgW, MAX_PHOTO_DISPLAY_H] })
        y = doc.y + 6
      } catch {
        doc.fontSize(9).fillColor(MUTED).font('Helvetica').text('(Photo could not be embedded.)', x, y)
        y = doc.y + 10
      }
    } else {
      doc.fontSize(9).fillColor(MUTED).font('Helvetica').text('(Photo unavailable for print.)', x, y)
      y = doc.y + 10
    }
    if (urls.length > 1) {
      doc.fontSize(8).fillColor(MUTED).font('Helvetica').text(`${urls.length - 1} additional photo(s) on file.`, x, y)
      y = doc.y + 6
    }
  } else {
    doc.fontSize(9).fillColor(MUTED).font('Helvetica').italic().text('No photo attached to this issue.', x, y)
    y = doc.y + 10
  }
  y += 8

  // Action section — compact table
  if (y > 420) {
    y = 420
  }
  doc.fontSize(10).fillColor(BRAND).font('Helvetica-Bold').text('Action', x, y)
  y = doc.y + 6
  doc.save().strokeColor(BORDER).lineWidth(0.6).moveTo(x, y).lineTo(x + innerW, y).stroke().restore()
  y += 10

  const qCol = innerW / 4 - 4
  const fields = [
    ['Assigned team', assignedTeam || '—'],
    ['Date sent', sentLine],
    ['Target completion', String(targetCompletionDate || '—')],
    ['Job number', String(jobNumber || '—')],
  ]
  let fx = x
  for (let i = 0; i < fields.length; i++) {
    const [lab, val] = fields[i]
    doc.fontSize(7).fillColor(MUTED).font('Helvetica-Bold').text(lab.toUpperCase(), fx, y, { width: qCol })
    doc.fontSize(9).fillColor(TEXT).font('Helvetica').text(val, fx, y + 12, { width: qCol })
    fx += qCol + 5
  }
  y += 42

  doc.fontSize(9).fillColor(TEXT).font('Helvetica')
    .text('We are looking into this and will update you when work is planned or completed.', x, y, {
      width: innerW,
      lineGap: 2,
    })
  y = doc.y + 12

  // Completion
  doc.fontSize(10).fillColor(BRAND).font('Helvetica-Bold').text('Completion (operational use)', x, y)
  y = doc.y + 6
  y = ruledField(doc, 'Attended by', x, y, innerW, 1)
  y = ruledField(doc, 'Date attended', x, y, innerW, 1)
  y = ruledField(doc, 'Work completed', x, y, innerW, 2, 14)
  y = ruledField(doc, 'Further action required', x, y, innerW, 2, 14)

  // Status strip + resident footer
  const footTop = Math.min(y + 6, doc.page.height - 72)
  doc.save().fillColor('#f8fafc').rect(x, footTop, innerW, 22).fill().restore()
  doc.fontSize(9).fillColor(TEXT).font('Helvetica-Bold').text(`Status: ${String(status)}`, x + 8, footTop + 6, {
    width: innerW - 16,
  })

  doc.fontSize(9).fillColor(MUTED).font('Helvetica-Oblique').text(
    'Thank you for reporting this issue.',
    x,
    footTop + 32,
    { width: innerW, align: 'center' }
  )

  doc.end()
  return new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
  })
}
