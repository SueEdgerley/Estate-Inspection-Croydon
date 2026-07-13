// Shared full-inspection PDF builder (ESM, Walkabout, Caretaker).
// Same design language; middle-column presentation adapts by report variant.

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
import {
  REPORT_VARIANTS,
  reportColumnLabels,
  reportFamilyTitle,
} from '@/lib/pdf/inspection-report-variant'

const MAX_IMAGE_WIDTH = 900
const JPEG_QUALITY = 0.82
const MARGIN = 36
const PAGE_W = A4[0]
const PAGE_H = A4[1]
const CONTENT_W = PAGE_W - MARGIN * 2
const FOOTER_H = 22

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

const COLOR = {
  green: hexToRgb('#15803D'),
  blue: hexToRgb('#2563EB'),
  amber: hexToRgb('#D97706'),
  red: hexToRgb('#DC2626'),
  gray: hexToRgb('#4B5563'),
}

/** Outlined A–D badges (form colour language). */
const GRADE_STYLES = {
  A: { color: COLOR.green, label: 'Acceptable' },
  B: { color: COLOR.blue, label: 'Adequate' },
  C: { color: COLOR.amber, label: 'Needs Improvement' },
  D: { color: COLOR.red, label: 'Unacceptable' },
  NA: { color: COLOR.gray, label: 'N/A' },
}

/**
 * Caretaker / Yes–No outcomes — labels map form Yes/No/NA to reader-facing results
 * without inventing A–D ratings.
 */
const OUTCOME_STYLES = {
  completed: { mark: 'Y', label: 'Completed', color: COLOR.green },
  acceptable: { mark: 'Y', label: 'Acceptable', color: COLOR.green },
  attention: { mark: '!', label: 'Attention required', color: COLOR.amber },
  not_completed: { mark: 'X', label: 'Not completed', color: COLOR.red },
  no: { mark: 'N', label: 'No', color: COLOR.gray },
  yes: { mark: 'Y', label: 'Yes', color: COLOR.green },
  na: { mark: '-', label: 'N/A', color: COLOR.gray },
}

const COL = {
  question: 0.46,
  rating: 0.18,
  photo: 0.36,
}

const PHOTO_BOX_W = Math.floor(CONTENT_W * COL.photo) - 16
const PHOTO_BOX_H = 58
const BADGE_D = 14
const LETTER_SIZE = 8
const LABEL_SIZE = 6.5
const BADGE_LABEL_GAP = 3
const RESULT_BLOCK_H = BADGE_D + BADGE_LABEL_GAP + LABEL_SIZE + 1
const TABLE_HEADER_H = 18
const CELL_PAD = 4
const COMPACT_ROW_MIN_H = 22
const PHOTO_ROW_MIN_H = PHOTO_BOX_H + CELL_PAD * 2
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
  if (ctx.y - needed >= MARGIN + FOOTER_H) return false
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

function normalizeYn(value) {
  const raw = String(value || '')
    .trim()
    .toUpperCase()
  if (raw === 'YES' || raw === 'Y' || raw === 'TRUE' || raw === '1') return 'YES'
  if (raw === 'NO' || raw === 'N' || raw === 'FALSE' || raw === '0') return 'NO'
  if (raw === 'NA' || raw === 'N/A' || raw === 'N A') return 'NA'
  return ''
}

function questionRawValue(question) {
  return String(question.rating || question.grade || question.answer || '').trim()
}

function resolveOutcomeStyle(question) {
  const mode = question.resultMode || 'text'
  const raw = questionRawValue(question)
  const grade = normalizeGrade(raw)
  if (grade && (mode === 'grade' || GRADE_STYLES[grade])) {
    return { kind: 'grade', grade, style: GRADE_STYLES[grade] }
  }

  const yn = normalizeYn(raw)
  if (yn) {
    if (mode === 'issue_yes_no') {
      if (yn === 'YES') return { kind: 'outcome', key: 'attention', style: OUTCOME_STYLES.attention }
      if (yn === 'NO') return { kind: 'outcome', key: 'acceptable', style: OUTCOME_STYLES.acceptable }
      return { kind: 'outcome', key: 'na', style: OUTCOME_STYLES.na }
    }
    if (mode === 'task_yes_no' || question.resultMode === 'task_yes_no') {
      if (yn === 'YES') return { kind: 'outcome', key: 'completed', style: OUTCOME_STYLES.completed }
      if (yn === 'NO') return { kind: 'outcome', key: 'not_completed', style: OUTCOME_STYLES.not_completed }
      return { kind: 'outcome', key: 'na', style: OUTCOME_STYLES.na }
    }
    // Walkabout / mixed: show Yes/No/NA clearly without inventing grades
    if (yn === 'YES') return { kind: 'outcome', key: 'yes', style: OUTCOME_STYLES.yes }
    if (yn === 'NO') return { kind: 'outcome', key: 'no', style: OUTCOME_STYLES.no }
    return { kind: 'outcome', key: 'na', style: OUTCOME_STYLES.na }
  }

  if (!raw) return { kind: 'empty' }
  return { kind: 'text', text: raw }
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

function drawOutlinedBadge(ctx, midX, badgeCy, mark, color) {
  ctx.page.drawCircle({
    x: midX,
    y: badgeCy,
    size: BADGE_D,
    borderColor: color,
    borderWidth: 1.15,
    color: WHITE,
  })
  const letterW = ctx.fonts.bold.widthOfTextAtSize(mark, LETTER_SIZE)
  ctx.page.drawText(mark, {
    x: midX - letterW / 2,
    y: badgeCy - LETTER_SIZE * 0.36,
    size: LETTER_SIZE,
    font: ctx.fonts.bold,
    color,
  })
}

function drawMiddleResult(ctx, cellX, cellBottom, cellWidth, cellHeight, question) {
  const resolved = resolveOutcomeStyle(question)
  const midX = cellX + cellWidth / 2
  const midY = cellBottom + cellHeight / 2

  if (resolved.kind === 'grade' && resolved.style) {
    const blockBottom = midY - RESULT_BLOCK_H / 2
    const badgeCy = blockBottom + LABEL_SIZE + BADGE_LABEL_GAP + BADGE_D / 2
    drawOutlinedBadge(ctx, midX, badgeCy, resolved.grade, resolved.style.color)
    const caption = resolved.style.label
    const captionW = ctx.fonts.regular.widthOfTextAtSize(caption, LABEL_SIZE)
    ctx.page.drawText(caption, {
      x: midX - captionW / 2,
      y: blockBottom,
      size: LABEL_SIZE,
      font: ctx.fonts.regular,
      color: resolved.style.color,
    })
    return
  }

  if (resolved.kind === 'outcome' && resolved.style) {
    const blockBottom = midY - RESULT_BLOCK_H / 2
    const badgeCy = blockBottom + LABEL_SIZE + BADGE_LABEL_GAP + BADGE_D / 2
    drawOutlinedBadge(ctx, midX, badgeCy, resolved.style.mark, resolved.style.color)
    const caption = resolved.style.label
    const captionW = ctx.fonts.regular.widthOfTextAtSize(caption, LABEL_SIZE)
    ctx.page.drawText(caption, {
      x: midX - Math.min(captionW, cellWidth - 4) / 2,
      y: blockBottom,
      size: LABEL_SIZE,
      font: ctx.fonts.regular,
      color: resolved.style.color,
    })
    return
  }

  if (resolved.kind === 'text') {
    const lines = measureLines(resolved.text, ctx.fonts.regular, 7.5, cellWidth - 8, 3)
    let ty = midY + ((lines.length - 1) * 9) / 2
    for (const line of lines) {
      const tw = ctx.fonts.regular.widthOfTextAtSize(line, 7.5)
      ctx.page.drawText(line, {
        x: midX - tw / 2,
        y: ty,
        size: 7.5,
        font: ctx.fonts.regular,
        color: BODY_COLOR,
      })
      ty -= 9
    }
  }
}

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

function drawTableHeader(ctx, cols, labels) {
  const h = TABLE_HEADER_H
  ensureSpace(ctx, h + 8)
  const top = ctx.y
  drawRect(ctx.page, MARGIN, top - h, CONTENT_W, h, { fill: TABLE_HEADER_BG })

  const headers = [
    { text: labels.question, x: MARGIN + CELL_PAD },
    { text: labels.middle, x: MARGIN + cols.q + CELL_PAD },
    { text: labels.photo, x: MARGIN + cols.q + cols.r + CELL_PAD },
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

function findingsHaveGrades(sections) {
  for (const section of sections || []) {
    for (const q of section.questions || []) {
      if (normalizeGrade(questionRawValue(q))) return true
      if (q.resultMode === 'grade') return true
    }
  }
  return false
}

function findingsHaveOutcomes(sections) {
  for (const section of sections || []) {
    for (const q of section.questions || []) {
      if (q.resultMode === 'task_yes_no' || q.resultMode === 'issue_yes_no') return true
      if (normalizeYn(questionRawValue(q)) && !normalizeGrade(questionRawValue(q))) return true
    }
  }
  return false
}

function drawGradeKey(ctx) {
  ensureSpace(ctx, 32)
  drawRect(ctx.page, MARGIN, ctx.y - 26, CONTENT_W, 26, {
    fill: hexToRgb('#f9fafb'),
    border: TABLE_BORDER,
  })
  ctx.page.drawText('Rating key', {
    x: MARGIN + 8,
    y: ctx.y - 11,
    size: 7.5,
    font: ctx.fonts.bold,
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

function drawOutcomeKey(ctx, variant) {
  ensureSpace(ctx, 32)
  drawRect(ctx.page, MARGIN, ctx.y - 26, CONTENT_W, 26, {
    fill: hexToRgb('#f9fafb'),
    border: TABLE_BORDER,
  })
  ctx.page.drawText(variant === REPORT_VARIANTS.CARETAKER ? 'Result key' : 'Outcome key', {
    x: MARGIN + 8,
    y: ctx.y - 11,
    size: 7.5,
    font: ctx.fonts.bold,
    color: BODY_COLOR,
  })
  const keyItems =
    variant === REPORT_VARIANTS.CARETAKER
      ? [
          OUTCOME_STYLES.completed,
          OUTCOME_STYLES.acceptable,
          OUTCOME_STYLES.attention,
          OUTCOME_STYLES.not_completed,
        ]
      : [OUTCOME_STYLES.yes, OUTCOME_STYLES.no, OUTCOME_STYLES.na]
  let kx = MARGIN + 70
  for (const item of keyItems) {
    const cx = kx + 5
    ctx.page.drawCircle({
      x: cx,
      y: ctx.y - 16,
      size: 8,
      borderColor: item.color,
      borderWidth: 1,
      color: WHITE,
    })
    const lw = ctx.fonts.bold.widthOfTextAtSize(item.mark, 6)
    ctx.page.drawText(item.mark, {
      x: cx - lw / 2,
      y: ctx.y - 18,
      size: 6,
      font: ctx.fonts.bold,
      color: item.color,
    })
    ctx.page.drawText(item.label, {
      x: kx + 14,
      y: ctx.y - 19,
      size: 7,
      font: ctx.fonts.regular,
      color: item.color,
    })
    kx += variant === REPORT_VARIANTS.CARETAKER ? 120 : 90
  }
  ctx.y -= 34
}

function drawPageFooters(pdfDoc, fonts) {
  const pages = pdfDoc.getPages()
  const total = pages.length
  pages.forEach((page, index) => {
    page.drawLine({
      start: { x: MARGIN, y: MARGIN + FOOTER_H - 6 },
      end: { x: PAGE_W - MARGIN, y: MARGIN + FOOTER_H - 6 },
      thickness: 0.5,
      color: TABLE_BORDER,
    })
    const left = 'Croydon Housing · Estate Inspection Report'
    page.drawText(left, {
      x: MARGIN,
      y: MARGIN + 4,
      size: 7,
      font: fonts.regular,
      color: MUTED_COLOR,
    })
    const right = `Page ${index + 1} of ${total}`
    const rw = fonts.regular.widthOfTextAtSize(right, 7)
    page.drawText(right, {
      x: PAGE_W - MARGIN - rw,
      y: MARGIN + 4,
      size: 7,
      font: fonts.regular,
      color: MUTED_COLOR,
    })
  })
}

/**
 * @param {Object} data
 * @returns {Promise<Uint8Array>}
 */
export async function buildInspectionReportPdf(data) {
  const {
    reportVariant = REPORT_VARIANTS.DEFAULT,
    templateName = 'Template',
    blockName = 'Block',
    completedAt,
    officerName = 'Officer',
    inspectionScopeLabel,
    sections = [],
    photos = [],
    actions = [],
  } = data

  const labels = reportColumnLabels(reportVariant)
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

  const logoH = drawLogoTopRight(ctx, PDF_LOGO_MAX_WIDTH, PDF_LOGO_MAX_HEIGHT)
  const title = reportFamilyTitle(reportVariant, templateName)

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

      ensureSpace(ctx, 28 + TABLE_HEADER_H + COMPACT_ROW_MIN_H)
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

      drawTableHeader(ctx, cols, labels)

      let rowIndex = 0
      for (const question of section.questions) {
        if (!question.text) continue
        rowIndex += 1

        const comment = question.comment && String(question.comment).trim() ? String(question.comment).trim() : ''
        const qPhotoList = photosByQuestionId[question.id] || []
        const firstUnusedPhoto = qPhotoList.find((p) => p.url && !usedPhotoUrls.has(String(p.url).trim()))
        const hasPhoto = Boolean(firstUnusedPhoto)

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

        // Compact when no photo; expand only when photo (or long comment) needs space
        const minForResult = RESULT_BLOCK_H + CELL_PAD * 2
        const rowH = hasPhoto
          ? Math.max(PHOTO_ROW_MIN_H, textH + CELL_PAD * 2, minForResult)
          : Math.max(COMPACT_ROW_MIN_H, textH + CELL_PAD * 2, Math.min(minForResult, RESULT_BLOCK_H + 6))

        if (ensureSpace(ctx, rowH + 2)) {
          drawTableHeader(ctx, cols, labels)
        }

        const top = ctx.y
        const bottom = top - rowH
        if (rowIndex % 2 === 0) {
          drawRect(ctx.page, MARGIN, bottom, CONTENT_W, rowH, { fill: ROW_ALT_BG })
        }

        drawRect(ctx.page, MARGIN, bottom, cols.q, rowH, { border: TABLE_BORDER })
        drawRect(ctx.page, MARGIN + cols.q, bottom, cols.r, rowH, { border: TABLE_BORDER })
        drawRect(ctx.page, MARGIN + cols.q + cols.r, bottom, cols.p, rowH, { border: TABLE_BORDER })

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

        drawMiddleResult(ctx, MARGIN + cols.q, bottom, cols.r, rowH, question)

        if (hasPhoto) {
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

    const showGrades = findingsHaveGrades(sections)
    const showOutcomes =
      reportVariant === REPORT_VARIANTS.CARETAKER ||
      (!showGrades && findingsHaveOutcomes(sections)) ||
      (reportVariant === REPORT_VARIANTS.WALKABOUT && findingsHaveOutcomes(sections) && !showGrades)

    if (showGrades) drawGradeKey(ctx)
    else if (showOutcomes || reportVariant === REPORT_VARIANTS.CARETAKER) drawOutcomeKey(ctx, reportVariant)
    else if (reportVariant !== REPORT_VARIANTS.CARETAKER) drawGradeKey(ctx)
  }

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

  drawPageFooters(pdfDoc, fonts)
  return new Uint8Array(await pdfDoc.save())
}
