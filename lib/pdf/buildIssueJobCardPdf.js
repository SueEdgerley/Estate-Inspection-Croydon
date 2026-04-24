/**
 * Single-action “repair sheet” / job card PDF (Homestead-style: concise, visual, field-led).
 * Not the full inspection layout — one card per issue.
 */

import PDFDocument from 'pdfkit'
import sharp from 'sharp'

const MAX_PHOTO_WIDTH = 420
const JPEG_QUALITY = 0.82

/** @param {string} url */
async function imageBufferForCard(url) {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    const meta = await sharp(buf).metadata()
    let w = meta.width || 800
    let h = meta.height || 600
    if (w > MAX_PHOTO_WIDTH) {
      h = Math.round((h * MAX_PHOTO_WIDTH) / w)
      w = MAX_PHOTO_WIDTH
    }
    return await sharp(buf)
      .resize(w, h, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: Math.round(JPEG_QUALITY * 100) })
      .toBuffer()
  } catch {
    return null
  }
}

function fieldBlockHeight(doc, label, value, x, y, width) {
  const v = value != null && String(value).trim() ? String(value).trim() : '—'
  let yy = y
  doc.fontSize(8).fillColor('#64748b').font('Helvetica').text(label.toUpperCase(), x, yy, { width })
  yy += 11
  doc.fontSize(11).fillColor('#0f172a').font('Helvetica-Bold')
  const valueH = doc.heightOfString(v, { width })
  doc.text(v, x, yy, { width })
  return yy + valueH + 10
}

function ruledLines(doc, x, y, width, count, lineHeight = 16) {
  doc.save()
  doc.strokeColor('#94a3b8').lineWidth(0.35)
  for (let i = 0; i < count; i++) {
    const yy = y + i * lineHeight
    doc.moveTo(x, yy).lineTo(x + width, yy).stroke()
  }
  doc.restore()
  return y + count * lineHeight
}

/**
 * @param {{
 *   actionId: string,
 *   inspectionType?: string,
 *   blockEstate?: string,
 *   location?: string,
 *   dateRaised?: string,
 *   issueTitle?: string,
 *   issueDetail?: string,
 *   assignedTeam?: string,
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
    dateRaised = '',
    issueTitle = '',
    issueDetail = '',
    assignedTeam = '—',
    status = 'Open',
    photoUrls = [],
  } = ctx

  const doc = new PDFDocument({ size: 'A4', margin: 0 })
  const chunks = []
  doc.on('data', (c) => chunks.push(c))

  const pageW = doc.page.width
  const pageH = doc.page.height
  const pad = 36
  const cardX = pad
  const cardY = pad
  const cardW = pageW - pad * 2
  const cardH = pageH - pad * 2
  const accent = 7

  // Page tint (practical workshop sheet)
  doc.save().fillColor('#e8edf2').rect(0, 0, pageW, pageH).fill().restore()

  // Card shadow (simple offset rect)
  doc.save().fillColor('#cbd5e1').rect(cardX + 3, cardY + 3, cardW, cardH).fill().restore()

  // Card face
  doc.save().fillColor('#ffffff').rect(cardX, cardY, cardW, cardH).fill().restore()
  doc.save().strokeColor('#94a3b8').lineWidth(1).rect(cardX, cardY, cardW, cardH).stroke().restore()

  // Left accent bar (repair-sheet style)
  doc.save().fillColor('#065f46').rect(cardX, cardY, accent, cardH).fill().restore()

  let x = cardX + accent + 18
  let y = cardY + 20
  const innerW = cardW - accent - 36

  // Title row — Homestead / repairs sheet vibe: bold utility header
  doc.fontSize(16).fillColor('#065f46').font('Helvetica-Bold').text('ACTION / REPAIR SHEET', x, y, { width: innerW })
  y = doc.y + 4
  doc.fontSize(9).fillColor('#475569').font('Helvetica').text('Croydon Housing — inspection issue (field use)', x, y, {
    width: innerW,
  })
  y = doc.y + 14

  doc.fontSize(8).fillColor('#64748b').font('Helvetica').text(`JOB REF  ${actionId}`, x, y, { width: innerW })
  y = doc.y + 12

  // Meta — single column (reliable print flow, Homestead-style clarity)
  y = fieldBlockHeight(doc, 'Block / estate', blockEstate, x, y, innerW)
  y = fieldBlockHeight(doc, 'Date raised', dateRaised, x, y, innerW)
  y = fieldBlockHeight(doc, 'Location', location || blockEstate, x, y, innerW)
  y = fieldBlockHeight(doc, 'Inspection type', inspectionType, x, y, innerW)
  y = fieldBlockHeight(doc, 'Assigned team / recipient', assignedTeam, x, y, innerW)

  // Issue block
  y += 6
  doc.fontSize(9).fillColor('#065f46').font('Helvetica-Bold').text('ISSUE', x, y)
  y = doc.y + 4
  doc.fontSize(11).fillColor('#0f172a').font('Helvetica-Bold').text(issueTitle || 'Issue raised', x, y, {
    width: innerW,
  })
  y = doc.y + 4
  if (issueDetail && issueDetail.trim()) {
    doc.fontSize(10).fillColor('#334155').font('Helvetica').text(issueDetail.trim(), x, y, {
    width: innerW,
    lineGap: 2,
  })
  y = doc.y + 8
  }

  // Photo(s) — visual anchor like a repairs sheet photo box
  const urls = (photoUrls || []).filter((u) => typeof u === 'string' && u.trim())
  if (urls.length > 0) {
    doc.fontSize(9).fillColor('#065f46').font('Helvetica-Bold').text('SITE PHOTO(S)', x, y)
    y = doc.y + 6
    const imgBuf = await imageBufferForCard(urls[0])
    if (imgBuf) {
      try {
        doc.image(imgBuf, x, y, { width: Math.min(380, innerW) })
        y = doc.y + 8
      } catch {
        doc.fontSize(9).fillColor('#94a3b8').font('Helvetica').text('(Photo could not be embedded)', x, y)
        y = doc.y + 10
      }
    } else {
      doc.fontSize(9).fillColor('#94a3b8').font('Helvetica').text('(Photo link unavailable for print)', x, y)
      y = doc.y + 10
    }
    if (urls.length > 1) {
      doc.fontSize(8).fillColor('#64748b').font('Helvetica').text(`+ ${urls.length - 1} more on record (see app / links).`, x, y)
      y = doc.y + 8
    }
  }

  y += 6
  doc.fontSize(9).fillColor('#065f46').font('Helvetica-Bold').text('REQUIRED ACTION', x, y)
  y = doc.y + 4
  doc.fontSize(10).fillColor('#0f172a').font('Helvetica').text('Please inspect the location and resolve as appropriate.', x, y, {
    width: innerW,
  })
  y = doc.y + 14

  // Completion — ruled area for staff on site
  doc.fontSize(9).fillColor('#065f46').font('Helvetica-Bold').text('COMPLETION (site use)', x, y)
  y = doc.y + 8
  doc.fontSize(8).fillColor('#64748b').font('Helvetica')
  const lineW = innerW
  const labels = [
    'Attended by',
    'Date attended',
    'Work completed',
    'Materials used',
    'Follow-up required?   Yes / No',
    'Further notes',
  ]
  for (const lab of labels) {
    doc.fillColor('#475569').font('Helvetica-Bold').text(`${lab}:`, x, y, { width: lineW })
    y = doc.y + 2
    const h = lab.includes('Work completed') || lab.includes('Further notes') ? 36 : 18
    ruledLines(doc, x, y, lineW, Math.ceil(h / 16), 16)
    y += h + 6
  }

  // Status footer — keep inside card
  const footerY = Math.min(y, cardY + cardH - 36)
  doc.save().fillColor('#f1f5f9').rect(x - 6, footerY - 4, innerW + 12, 28).fill().restore()
  doc.fontSize(10).fillColor('#0f172a').font('Helvetica-Bold').text(`STATUS: ${String(status).toUpperCase()}`, x, footerY, {
    width: innerW,
  })

  doc.end()
  return new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
  })
}
