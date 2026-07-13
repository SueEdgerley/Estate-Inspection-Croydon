// Template-agnostic PDF builder for inspection reports.
// Professional findings table layout (pdf-lib).

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

const MAX_IMAGE_WIDTH = 900
const JPEG_QUALITY = 0.82
const MARGIN = 36
const PAGE_W = A4[0]
const PAGE_H = A4[1]
const CONTENT_W = PAGE_W - MARGIN * 2

const HEADING_COLOR = hexToRgb('#1e3a5f')
const TABLE_HEADER_BG = hexToRgb('#3d2b6b')
const TABLE_BORDER = hexToRgb('#d1d5db')
const BODY_COLOR = hexToRgb('#111827')
const MUTED_COLOR = rgb(0.45, 0.45, 0.45)
const WHITE = rgb(1, 1, 1)
const ROW_ALT_BG = hexToRgb('#fbfbfc')
const SUCCESS_BG = hexToRgb('#ecfdf5')
const SUCCESS_BORDER = hexToRgb('#86efac')
const SUCCESS_TEXT = hexToRgb('#166534')

/**
 * Outlined rating badges — letter colours match the concept / report palette.
 * Descriptive labels follow the standard A–D inspection wording.
 */
const GRADE_STYLES = {
  A: { color: hexToRgb('#15803D'), label: 'Acceptable' },
  B: { color: hexToRgb('#2563EB'), label: 'Adequate' },
  C: { color: hexToRgb('#D97706'), label: 'Needs Improvement' },
  D: { color: hexToRgb('#DC2626'), label: 'Unacceptable' },
  NA: { color: hexToRgb('#4B5563'), label: 'N/A' },
}

const COL = {
  question: 0.46,
  rating: 0.18,
  photo: 0.36,
}

/** Fixed photo frame — every evidence image fits inside the same box. */
const PHOTO_BOX_W = Math.floor(CONTENT_W * COL.photo) - 16
const PHOTO_BOX_H = 58
const RATING_BADGE_D = 14
const RATING_LETTER_SIZE = 8
const RATING_LABEL_SIZE = 6.5
const RATING_BADGE_LABEL_GAP = 3
const RATING_BLOCK_H = RATING_BADGE_D + RATING_BADGE_LABEL_GAP + RATING_LABEL_SIZE + 1
const TABLE_HEADER_H = 18
const CELL_PAD = 4
const ROW_MIN_H = PHOTO_BOX_H + CELL_PAD * 2
const Q_LINE_H = 10
const COMMENT_LINE_H = 9

async function loadLogoImage(pdfDoc) {
  try {
    const logoPath = path.join(process.cwd(), 'public', CROYDON_HOUSING_LOGO_FILE)
    if (!fs.existsSync(logoPath)) return null
    const png = await sharp(fs.readFileSync(logoPath)).png().toBuffer()
    return await pdfDoc.embedPng(png)
  } catch (error) {
    console.warn('[inspection-report-pdf] logo skipped:', error?.message || error)
    return null
  }
}

function drawLogoTopRight(ctx, maxWidth, maxHeight) {
  if (!ctx.logoImage) {
    const label = 'Croydon Housing'
    const tw = ctx.fonts.bold.widthOfTextAtSize(label, 11)
    ctx.page.drawText(label, {
      x: PAGE_W - MARGIN - tw,
      y: ctx.y - 14,
      size: 11,
      font: ctx.fonts.bold,
      color: HEADING_COLOR,
    })
    return 20
  }
  const scale = Math.min(maxWidth / ctx.logoImage.width, maxHeight / ctx.logoImage.height, 1)
  const width = ctx.logoImage.width * scale
  const height = ctx.logoImage.height * scale
  ctx.page.drawImage(ctx.logoImage, {
    x: PAGE_W - MARGIN - width,
    y: ctx.y - height,
    width,
    height,
  })
  return height
}

async function loadJpegForPdf(url) {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    return await sharp(buf)
      .resize(MAX_IMAGE_WIDTH, MAX_IMAGE_WIDTH, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: Math.round(JPEG_QUALITY * 100) })
      .toBuffer()
  } catch (err) {
    console.warn('[PDF] Could not load image:', url, err.message)
    return null
  }
}

function newPage(ctx) {
  ctx.page = ctx.pdfDoc.addPage(A4)
  ctx.y = PAGE_H - MARGIN
}

function ensureSpace(ctx, needed) {
  if (ctx.y - needed >= MARGIN) return false
  newPage(ctx)
  return true
}

function normalizeGrade(value) {
  const raw = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/^GRADE[\s_-]*/i, '')
    .replace(/\s+/g, '')
  if (raw === 'N/A' || raw === 'NA') return 'NA'
  if (raw === 'A' || raw === 'B' || raw === 'C' || raw === 'D') return raw
  return ''
}

function questionRating(question) {
  return (
    normalizeGrade(question.rating) ||
    normalizeGrade(question.grade) ||
    normalizeGrade(question.answer) ||
    String(question.rating || question.grade || question.answer || '').trim()
  )
}

function measureLines(text, font, size, maxWidth, maxLines = 8) {
  const lines = splitText(safeText(text), font, size, maxWidth).slice(0, maxLines)
  return lines.length ? lines : ['']
}

function colWidths() {
  return {
    q: CONTENT_W * COL.question,
    r: CONTENT_W * COL.rating,
    p: CONTENT_W * COL.photo,
  }
}

function drawRect(page, x, y, w, h, { fill, border, borderWidth = 0.6 } = {}) {
  if (fill) {
    page.drawRectangle({ x, y, width: w, height: h, color: fill, borderWidth: 0 })
  }
  if (border) {
    page.drawRectangle({
      x,
      y,
      width: w,
      height: h,
      borderColor: border,
      borderWidth,
    })
  }
}

/**
 * Draws badge + label as one vertically stacked component, centred in the rating cell.
 * Returns nothing — position is always derived from the cell so every row aligns.
 */
function drawRatingComponent(ctx, cellX, cellBottom, cellWidth, cellHeight, rating) {
  const grade = normalizeGrade(rating)
  const style = GRADE_STYLES[grade] || null
  const letter = grade || String(rating || '—').slice(0, 4)
  const blockH = style ? RATING_BLOCK_H : RATING_LETTER_SIZE
  const midX = cellX + cellWidth / 2
  const midY = cellBottom + cellHeight / 2
  const blockBottom = midY - blockH / 2
  const badgeCy = blockBottom + (style ? RATING_LABEL_SIZE + RATING_BADGE_LABEL_GAP : 0) + RATING_BADGE_D / 2

  if (style) {
    ctx.page.drawCircle({
      x: midX,
      y: badgeCy,
      size: RATING_BADGE_D,
      borderColor: style.color,
      borderWidth: 1.15,
      color: WHITE,
    })
    const letterW = ctx.fonts.bold.widthOfTextAtSize(letter, RATING_LETTER_SIZE)
    ctx.page.drawText(letter, {
      x: midX - letterW / 2,
      y: badgeCy - RATING_LETTER_SIZE * 0.36,
      size: RATING_LETTER_SIZE,
      font: ctx.fonts.bold,
      color: style.color,
    })
    const caption = style.label
    const captionW = ctx.fonts.regular.widthOfTextAtSize(caption, RATING_LABEL_SIZE)
    ctx.page.drawText(caption, {
      x: midX - captionW / 2,
      y: blockBottom,
      size: RATING_LABEL_SIZE,
      font: ctx.fonts.regular,
      color: style.color,
    })
  } else {
    const tw = ctx.fonts.bold.widthOfTextAtSize(letter, 8)
    ctx.page.drawText(letter, {
      x: midX - tw / 2,
      y: midY - 3,
      size: 8,
      font: ctx.fonts.bold,
      color: BODY_COLOR,
    })
  }
}

/**
 * Place photo inside a fixed frame, centred in the photo cell (same frame size every row).
 */
async function drawPhotoInCell(ctx, photo, cellX, cellBottom, cellWidth, cellHeight, usedUrls) {
  const url = String(photo?.url || '').trim()
  if (!url || usedUrls.has(url)) return false
  usedUrls.add(url)

  const imgBuf = await loadJpegForPdf(url)
  if (!imgBuf) return false
  try {
    const img = await ctx.pdfDoc.embedJpg(imgBuf)
    const scale = Math.min(PHOTO_BOX_W / img.width, PHOTO_BOX_H / img.height, 1)
    const w = img.width * scale
    const h = img.height * scale
    const frameX = cellX + (cellWidth - PHOTO_BOX_W) / 2
    const frameY = cellBottom + (cellHeight - PHOTO_BOX_H) / 2
    const x = frameX + (PHOTO_BOX_W - w) / 2
    const y = frameY + (PHOTO_BOX_H - h) / 2
    ctx.page.drawImage(img, { x, y, width: w, height: h })
    return true
  } catch (err) {
    console.warn('[PDF] Could not embed image:', url, err.message)
    return false
  }
}

function drawTableHeader(ctx, cols) {
  const h = TABLE_HEADER_H
  ensureSpace(ctx, h + 8)
  const top = ctx.y
  drawRect(ctx.page, MARGIN, top - h, CONTENT_W, h, { fill: TABLE_HEADER_BG })

  const headers = [
    { text: 'Question / Item Inspected', x: MARGIN + CELL_PAD, w: cols.q - CELL_PAD * 2 },
    { text: 'Rating', x: MARGIN + cols.q + CELL_PAD, w: cols.r - CELL_PAD * 2 },
    { text: 'Photo / Evidence', x: MARGIN + cols.q + cols.r + CELL_PAD, w: cols.p - CELL_PAD * 2 },
  ]
  for (const header of headers) {
    ctx.page.drawText(header.text, {
      x: header.x,
      y: top - 12,
      size: 8,
      font: ctx.fonts.bold,
      color: WHITE,
    })
  }
  ctx.y = top - h
}

function drawMetaLine(ctx, label, value) {
  if (!value) return
  const line = `${label}: ${safeText(value)}`
  ctx.page.drawText(line, {
    x: MARGIN,
    y: ctx.y,
    size: 9.5,
    font: ctx.fonts.regular,
    color: BODY_COLOR,
  })
  ctx.y -= 13
}

/**
 * @param {Object} data
 * @returns {Promise<Uint8Array>}
 */
export async function buildInspectionReportPdf(data) {
  const {
    templateName = 'Template',
    blockName = 'Block',
    completedAt,
    officerName = 'Officer',
    inspectionScopeLabel,
    sections = [],
    photos = [],
    actions = [],
  } = data

  const dateStr = completedAt
    ? new Date(completedAt).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

  const { pdfDoc, fonts } = await createStandardPdfDocument()
  const logoImage = await loadLogoImage(pdfDoc)
  const ctx = { pdfDoc, fonts, logoImage, page: null, y: 0 }
  newPage(ctx)
  const cols = colWidths()
  const usedPhotoUrls = new Set()

  // Header: title left, Croydon Housing logo right
  const logoH = drawLogoTopRight(ctx, PDF_LOGO_MAX_WIDTH, PDF_LOGO_MAX_HEIGHT)
  const title = String(templateName || 'Inspection').toUpperCase().includes('REPORT')
    ? String(templateName).toUpperCase()
    : `${String(templateName || 'INSPECTION').toUpperCase()} REPORT`

  ctx.y = drawWrappedText(ctx.page, title, {
    x: MARGIN,
    y: ctx.y,
    width: CONTENT_W - PDF_LOGO_MAX_WIDTH - 12,
    font: fonts.bold,
    size: 15,
    color: HEADING_COLOR,
    lineHeight: 18,
    maxLines: 2,
  })
  ctx.y = Math.min(ctx.y, PAGE_H - MARGIN - logoH) - 10

  drawMetaLine(ctx, 'Estate / Block', blockName)
  drawMetaLine(ctx, 'Inspection Date', dateStr)
  drawMetaLine(ctx, 'Inspector', officerName)
  drawMetaLine(ctx, 'Form', templateName)
  if (inspectionScopeLabel) drawMetaLine(ctx, 'Scope', inspectionScopeLabel)
  ctx.y -= 6

  const photosByQuestionId = {}
  for (const photo of photos || []) {
    if (!photo?.linkedQuestionId || !photo?.url) continue
    const qid = photo.linkedQuestionId
    if (!photosByQuestionId[qid]) photosByQuestionId[qid] = []
    photosByQuestionId[qid].push(photo)
  }

  const reportableActions = (actions || []).filter((action) => action.isReportableIssue !== false)
  const hasFindings = sections.some((section) => (section.questions || []).length > 0)

  if (hasFindings) {
    ensureSpace(ctx, 24)
    ctx.y = drawWrappedText(ctx.page, 'Inspection Findings', {
      x: MARGIN,
      y: ctx.y,
      width: CONTENT_W,
      font: fonts.bold,
      size: 11,
      color: HEADING_COLOR,
      lineHeight: 13,
      maxLines: 1,
    }) - 3

    let sectionIndex = 0
    for (const section of sections) {
      if (!section.title || !section.questions || section.questions.length === 0) continue
      sectionIndex += 1

      ensureSpace(ctx, 28 + TABLE_HEADER_H + ROW_MIN_H)
      ctx.y = drawWrappedText(ctx.page, `${sectionIndex}. ${section.title}`, {
        x: MARGIN,
        y: ctx.y,
        width: CONTENT_W,
        font: fonts.bold,
        size: 10,
        color: HEADING_COLOR,
        lineHeight: 12,
        maxLines: 2,
      }) - 1
      ctx.page.drawText('The following items were inspected as part of this section.', {
        x: MARGIN,
        y: ctx.y,
        size: 7.5,
        font: fonts.italic,
        color: MUTED_COLOR,
      })
      ctx.y -= 10

      drawTableHeader(ctx, cols)

      let rowIndex = 0
      for (const question of section.questions) {
        if (!question.text) continue
        rowIndex += 1

        const rating = questionRating(question)
        const comment = question.comment && String(question.comment).trim() ? String(question.comment).trim() : ''
        const qPhotoList = photosByQuestionId[question.id] || []
        const firstUnusedPhoto = qPhotoList.find((p) => p.url && !usedPhotoUrls.has(String(p.url).trim()))

        const qLines = measureLines(
          `${sectionIndex}.${rowIndex}  ${question.text}`,
          fonts.regular,
          8,
          cols.q - CELL_PAD * 2,
          5
        )
        const commentLines = comment
          ? measureLines(`Comment: ${comment}`, fonts.italic, 7, cols.q - CELL_PAD * 2, 3)
          : []
        const textH =
          qLines.length * Q_LINE_H + (commentLines.length ? 2 + commentLines.length * COMMENT_LINE_H : 0)
        const rowH = Math.max(ROW_MIN_H, textH + CELL_PAD * 2, RATING_BLOCK_H + CELL_PAD * 2)

        if (ensureSpace(ctx, rowH + 2)) {
          drawTableHeader(ctx, cols)
        }

        const top = ctx.y
        const bottom = top - rowH
        if (rowIndex % 2 === 0) {
          drawRect(ctx.page, MARGIN, bottom, CONTENT_W, rowH, { fill: ROW_ALT_BG })
        }

        drawRect(ctx.page, MARGIN, bottom, cols.q, rowH, { border: TABLE_BORDER })
        drawRect(ctx.page, MARGIN + cols.q, bottom, cols.r, rowH, { border: TABLE_BORDER })
        drawRect(ctx.page, MARGIN + cols.q + cols.r, bottom, cols.p, rowH, { border: TABLE_BORDER })

        // Question + optional comment — compact line spacing
        let ty = top - CELL_PAD - 8
        for (const line of qLines) {
          ctx.page.drawText(line, {
            x: MARGIN + CELL_PAD,
            y: ty,
            size: 8,
            font: fonts.regular,
            color: BODY_COLOR,
          })
          ty -= Q_LINE_H
        }
        if (commentLines.length) {
          ty -= 1
          for (const line of commentLines) {
            ctx.page.drawText(line, {
              x: MARGIN + CELL_PAD,
              y: ty,
              size: 7,
              font: fonts.italic,
              color: MUTED_COLOR,
            })
            ty -= COMMENT_LINE_H
          }
        }

        drawRatingComponent(ctx, MARGIN + cols.q, bottom, cols.r, rowH, rating)

        if (firstUnusedPhoto) {
          await drawPhotoInCell(
            ctx,
            firstUnusedPhoto,
            MARGIN + cols.q + cols.r,
            bottom,
            cols.p,
            rowH,
            usedPhotoUrls
          )
        }

        ctx.y = bottom
      }

      ctx.y -= 10
    }

    // Compact rating key
    ensureSpace(ctx, 32)
    drawRect(ctx.page, MARGIN, ctx.y - 26, CONTENT_W, 26, {
      fill: hexToRgb('#f9fafb'),
      border: TABLE_BORDER,
    })
    ctx.page.drawText('Rating key', {
      x: MARGIN + 8,
      y: ctx.y - 11,
      size: 7.5,
      font: fonts.bold,
      color: BODY_COLOR,
    })
    const keyItems = [
      { g: 'A', t: 'Acceptable' },
      { g: 'B', t: 'Adequate' },
      { g: 'C', t: 'Needs Improvement' },
      { g: 'D', t: 'Unacceptable' },
    ]
    let kx = MARGIN + 68
    for (const item of keyItems) {
      const color = GRADE_STYLES[item.g].color
      const cx = kx + 5
      ctx.page.drawCircle({
        x: cx,
        y: ctx.y - 16,
        size: 8,
        borderColor: color,
        borderWidth: 1,
        color: WHITE,
      })
      const lw = ctx.fonts.bold.widthOfTextAtSize(item.g, 6)
      ctx.page.drawText(item.g, {
        x: cx - lw / 2,
        y: ctx.y - 18,
        size: 6,
        font: ctx.fonts.bold,
        color,
      })
      ctx.page.drawText(item.t, {
        x: kx + 14,
        y: ctx.y - 19,
        size: 7,
        font: ctx.fonts.regular,
        color,
      })
      kx += 112
    }
    ctx.y -= 34
  }

  // Only unlinked photos that were never shown in findings (before Issues so
  // a clean inspection can end on the “no issues” banner).
  const unlinkedPhotos = (photos || []).filter((p) => {
    if (p.linkedQuestionId) return false
    const url = String(p.url || '').trim()
    return url && !usedPhotoUrls.has(url)
  })
  if (unlinkedPhotos.length > 0) {
    ensureSpace(ctx, 40)
    ctx.y = drawWrappedText(ctx.page, 'Additional Photos', {
      x: MARGIN,
      y: ctx.y,
      width: CONTENT_W,
      font: fonts.bold,
      size: 11,
      color: HEADING_COLOR,
      lineHeight: 14,
      maxLines: 1,
    }) - 8
    for (const photo of unlinkedPhotos) {
      ensureSpace(ctx, PHOTO_BOX_H + 14)
      const top = ctx.y
      const bottom = top - PHOTO_BOX_H - CELL_PAD * 2
      const ok = await drawPhotoInCell(
        ctx,
        photo,
        MARGIN,
        bottom,
        PHOTO_BOX_W + CELL_PAD * 2,
        PHOTO_BOX_H + CELL_PAD * 2,
        usedPhotoUrls
      )
      if (ok) ctx.y = bottom - 6
      else ctx.y = top - 12
    }
    ctx.y -= 8
  }

  // Issues Raised — photos already shown in findings are not repeated
  ensureSpace(ctx, 50)
  ctx.y = drawWrappedText(ctx.page, 'Issues Raised', {
    x: MARGIN,
    y: ctx.y,
    width: CONTENT_W,
    font: fonts.bold,
    size: 12,
    color: HEADING_COLOR,
    lineHeight: 15,
    maxLines: 1,
  }) - 8

  if (reportableActions.length === 0) {
    ensureSpace(ctx, 44)
    drawRect(ctx.page, MARGIN, ctx.y - 36, CONTENT_W, 36, {
      fill: SUCCESS_BG,
      border: SUCCESS_BORDER,
    })
    ctx.page.drawCircle({
      x: MARGIN + 18,
      y: ctx.y - 18,
      size: 8,
      color: SUCCESS_TEXT,
    })
    ctx.page.drawText('No issues were identified during this inspection.', {
      x: MARGIN + 34,
      y: ctx.y - 15,
      size: 10,
      font: fonts.bold,
      color: SUCCESS_TEXT,
    })
    ctx.page.drawText('All inspected items have been recorded with no follow-up actions required.', {
      x: MARGIN + 34,
      y: ctx.y - 28,
      size: 8,
      font: fonts.regular,
      color: SUCCESS_TEXT,
    })
    ctx.y -= 48
  } else {
    for (let i = 0; i < reportableActions.length; i += 1) {
      const action = reportableActions[i]
      ensureSpace(ctx, 70)

      ctx.y = drawWrappedText(ctx.page, `Issue ${i + 1}${action.title ? `: ${action.title}` : ''}`, {
        x: MARGIN,
        y: ctx.y,
        width: CONTENT_W,
        font: fonts.bold,
        size: 10,
        color: BODY_COLOR,
        lineHeight: 13,
        maxLines: 3,
      }) - 3

      const description = action.description || action.issue || action.details || ''
      if (description) {
        ctx.y = drawWrappedText(ctx.page, description, {
          x: MARGIN,
          y: ctx.y,
          width: CONTENT_W,
          font: fonts.regular,
          size: 9,
          color: BODY_COLOR,
          lineHeight: 12,
          maxLines: 5,
        }) - 2
      }
      if (action.priority) {
        ctx.page.drawText(`Priority: ${safeText(action.priority)}`, {
          x: MARGIN,
          y: ctx.y,
          size: 9,
          font: fonts.regular,
          color: BODY_COLOR,
        })
        ctx.y -= 12
      }
      if (action.status) {
        ctx.page.drawText(`Status: ${safeText(action.status)}`, {
          x: MARGIN,
          y: ctx.y,
          size: 9,
          font: fonts.regular,
          color: BODY_COLOR,
        })
        ctx.y -= 12
      }

      const issuePhotos = Array.isArray(action.photoUrls)
        ? action.photoUrls.map((url) => String(url || '').trim()).filter(Boolean)
        : []
      const newIssuePhotos = issuePhotos.filter((url) => !usedPhotoUrls.has(url))
      if (newIssuePhotos.length > 0) {
        ctx.page.drawText('Photo', {
          x: MARGIN,
          y: ctx.y,
          size: 9,
          font: fonts.regular,
          color: BODY_COLOR,
        })
        ctx.y -= 12
        for (const url of newIssuePhotos) {
          ensureSpace(ctx, PHOTO_BOX_H + 14)
          const top = ctx.y
          const bottom = top - PHOTO_BOX_H - CELL_PAD * 2
          const ok = await drawPhotoInCell(
            ctx,
            { url },
            MARGIN,
            bottom,
            PHOTO_BOX_W + CELL_PAD * 2,
            PHOTO_BOX_H + CELL_PAD * 2,
            usedPhotoUrls
          )
          if (ok) ctx.y = bottom - 6
          else {
            ctx.page.drawText('Photo unavailable for print.', {
              x: MARGIN,
              y: ctx.y,
              size: 8,
              font: fonts.italic,
              color: MUTED_COLOR,
            })
            ctx.y -= 12
          }
        }
      }

      ctx.y -= 10
    }
  }

  return new Uint8Array(await pdfDoc.save())
}
