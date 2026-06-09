// Template-agnostic PDF builder for inspection reports.
// Uses pdf-lib standard fonts to avoid pdfkit Helvetica.afm resolution on Vercel.

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
import {
  CROYDON_HOUSING_LOGO_FILE,
  PDF_LOGO_MAX_HEIGHT,
  PDF_LOGO_MAX_WIDTH,
} from '@/lib/logo-branding'

const MAX_IMAGE_WIDTH = 1200
const JPEG_QUALITY = 0.8
const MARGIN = 50

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

function drawLogo(ctx, x, y, maxWidth, maxHeight) {
  if (!ctx.logoImage) {
    ctx.page.drawText('Croydon Housing', {
      x,
      y: y - 22,
      size: 16,
      font: ctx.fonts.bold,
      color: hexToRgb('#0f172a'),
    })
    return maxWidth
  }

  const scale = Math.min(maxWidth / ctx.logoImage.width, maxHeight / ctx.logoImage.height, 1)
  const width = ctx.logoImage.width * scale
  const height = ctx.logoImage.height * scale
  ctx.page.drawImage(ctx.logoImage, { x, y: y - height, width, height })
  return width
}

async function resizeImageForPdf(url) {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    const meta = await sharp(buf).metadata()
    let w = meta.width || 800
    let h = meta.height || 600
    if (w > MAX_IMAGE_WIDTH) {
      h = Math.round((h * MAX_IMAGE_WIDTH) / w)
      w = MAX_IMAGE_WIDTH
    }
    return await sharp(buf)
      .resize(w, h, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: Math.round(JPEG_QUALITY * 100) })
      .toBuffer()
  } catch (err) {
    console.warn('[PDF] Could not resize image:', url, err.message)
    return null
  }
}

function newPage(ctx) {
  ctx.page = ctx.pdfDoc.addPage(A4)
  ctx.y = A4[1] - MARGIN
}

function ensureSpace(ctx, needed) {
  if (ctx.y - needed >= MARGIN) return
  newPage(ctx)
}

async function drawPhoto(ctx, photo, width = 300) {
  const imgBuf = await resizeImageForPdf(photo.url)
  if (!imgBuf) return false
  try {
    const img = await ctx.pdfDoc.embedJpg(imgBuf)
    const maxH = 240
    const scale = Math.min(width / img.width, maxH / img.height, 1)
    const w = img.width * scale
    const h = img.height * scale
    ensureSpace(ctx, h + 35)
    ctx.page.drawImage(img, { x: MARGIN, y: ctx.y - h, width: w, height: h })
    ctx.y -= h + 8
    if (photo.caption) {
      ctx.y = drawWrappedText(ctx.page, photo.caption, {
        x: MARGIN + 20,
        y: ctx.y,
        width: A4[0] - MARGIN * 2 - 20,
        font: ctx.fonts.italic,
        size: 9,
        color: rgb(0.35, 0.35, 0.35),
      }) - 4
    }
    return true
  } catch (imgErr) {
    console.warn('[PDF] Could not add image:', photo.url, imgErr.message)
    return false
  }
}

function photoCountLabel(count) {
  const safeCount = Number(count) || 0
  if (safeCount <= 0) return 'No photos attached'
  return safeCount === 1 ? '1 photo attached' : `${safeCount} photos attached`
}

function drawActionField(ctx, label, value, width) {
  if (!value) return
  ctx.y = drawWrappedText(ctx.page, `${label}: ${value}`, {
    x: MARGIN + 10,
    y: ctx.y,
    width: width - 10,
    font: label === 'Issue' ? ctx.fonts.italic : ctx.fonts.regular,
    size: label === 'Issue' ? 9.5 : 9.25,
    color: label === 'Issue' ? rgb(0.25, 0.25, 0.25) : rgb(0.35, 0.35, 0.35),
    lineHeight: 12,
    maxLines: label === 'Details' ? 4 : 3,
  }) - 2
}

/**
 * Build inspection report PDF from template-agnostic data structure.
 *
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

  const sectionQuestionCount = sections.reduce(
    (sum, section) => sum + (section.questions?.length || 0),
    0
  )
  const rendererCommentCount = sections.reduce(
    (sum, section) =>
      sum + (section.questions?.filter((q) => q.comment && String(q.comment).trim()).length || 0),
    0
  )
  console.log(
    '[PDF renderer] templateName=%s sections=%d questions=%d comments=%d photos=%d actions=%d',
    templateName,
    sections.length,
    sectionQuestionCount,
    rendererCommentCount,
    photos.length,
    actions.length
  )

  const dateStr = completedAt
    ? new Date(completedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

  const { pdfDoc, fonts } = await createStandardPdfDocument()
  const logoImage = await loadLogoImage(pdfDoc)
  const ctx = { pdfDoc, fonts, logoImage, page: null, y: 0 }
  newPage(ctx)
  const width = A4[0] - MARGIN * 2

  drawLogo(ctx, MARGIN, ctx.y, PDF_LOGO_MAX_WIDTH, PDF_LOGO_MAX_HEIGHT)
  ctx.y -= PDF_LOGO_MAX_HEIGHT + 18

  ctx.y = drawWrappedText(ctx.page, `${templateName.toUpperCase()} - ${blockName}`, {
    x: MARGIN,
    y: ctx.y,
    width,
    font: fonts.bold,
    size: 16,
    color: hexToRgb('#0f172a'),
    lineHeight: 20,
    maxLines: 3,
  }) - 4
  ctx.page.drawText(`Completed: ${dateStr}`, { x: MARGIN, y: ctx.y, size: 11, font: fonts.regular })
  ctx.y -= 15
  if (officerName) {
    ctx.page.drawText(`Inspector: ${safeText(officerName)}`, { x: MARGIN, y: ctx.y, size: 11, font: fonts.regular })
    ctx.y -= 15
  }
  if (inspectionScopeLabel) {
    ctx.y = drawWrappedText(ctx.page, safeText(inspectionScopeLabel), {
      x: MARGIN,
      y: ctx.y,
      width,
      font: fonts.regular,
      size: 11,
      lineHeight: 14,
      maxLines: 2,
    }) - 4
  }
  ctx.y -= 14

  const photosByQuestionId = {}
  photos.forEach((photo) => {
    if (photo.linkedQuestionId) {
      if (!photosByQuestionId[photo.linkedQuestionId]) photosByQuestionId[photo.linkedQuestionId] = []
      photosByQuestionId[photo.linkedQuestionId].push(photo)
    }
  })

  for (const section of sections) {
    if (!section.title || !section.questions || section.questions.length === 0) continue

    ensureSpace(ctx, 70)
    ctx.y = drawWrappedText(ctx.page, section.title.toUpperCase(), {
      x: MARGIN,
      y: ctx.y,
      width,
      font: fonts.bold,
      size: 13,
      color: hexToRgb('#0f4c5c'),
      lineHeight: 16,
      maxLines: 3,
    }) - 8

    for (const question of section.questions) {
      if (!question.text) continue
      ensureSpace(ctx, 80)

      ctx.y = drawWrappedText(ctx.page, question.text, {
        x: MARGIN,
        y: ctx.y,
        width,
        font: fonts.bold,
        size: 10.5,
        color: hexToRgb('#111827'),
        lineHeight: 13,
        maxLines: 5,
      }) - 3

      const answerText = question.answer || question.answerValue || ''
      const gradeText = question.grade ? ` (${question.grade})` : ''
      ctx.y = drawWrappedText(ctx.page, `Answer: ${answerText}${gradeText}`, {
        x: MARGIN,
        y: ctx.y,
        width,
        font: fonts.regular,
        size: 10,
        lineHeight: 12,
        maxLines: 5,
      }) - 2

      if (question.comment && question.comment.trim()) {
        ctx.y = drawWrappedText(ctx.page, `Comment: ${question.comment}`, {
          x: MARGIN + 20,
          y: ctx.y,
          width: width - 20,
          font: fonts.italic,
          size: 9.5,
          color: rgb(0.35, 0.35, 0.35),
          lineHeight: 12,
          maxLines: 6,
        }) - 2
      }

      if (question.actionCreated) {
        ctx.page.drawText('Issue / action recorded', { x: MARGIN + 20, y: ctx.y, size: 9.5, font: fonts.bold, color: hexToRgb('#dc2626') })
        ctx.y -= 13
      }

      const questionPhotos = photosByQuestionId[question.id] || []
      if (questionPhotos.length > 0) {
        ensureSpace(ctx, 45)
        ctx.page.drawText('Photo(s):', { x: MARGIN, y: ctx.y, size: 10, font: fonts.bold })
        ctx.y -= 13
        for (const photo of questionPhotos) {
          const ok = await drawPhoto(ctx, photo)
          if (!ok) {
            ctx.y = drawWrappedText(ctx.page, `[Image: ${photo.url}]`, {
              x: MARGIN + 20,
              y: ctx.y,
              width: width - 20,
              font: fonts.regular,
              size: 9,
              color: rgb(0.35, 0.35, 0.35),
            }) - 3
          }
        }
      }

      ctx.y -= 8
    }

    ctx.y -= 14
  }

  const unlinkedPhotos = photos.filter((p) => !p.linkedQuestionId)
  if (actions.length > 0) {
    newPage(ctx)
    ctx.page.drawText('ACTIONS', { x: MARGIN, y: ctx.y, size: 13, font: fonts.bold, color: hexToRgb('#0f4c5c') })
    ctx.y -= 22

    for (const action of actions) {
      ensureSpace(ctx, 90)
      ctx.y = drawWrappedText(ctx.page, action.title || 'Action', {
        x: MARGIN,
        y: ctx.y,
        width,
        font: fonts.bold,
        size: 11,
        color: hexToRgb('#111827'),
        lineHeight: 14,
        maxLines: 4,
      }) - 4

      drawActionField(ctx, 'Issue', action.issue, width)
      drawActionField(ctx, 'Details', action.details, width)
      drawActionField(ctx, 'Photos', photoCountLabel(action.photoCount), width)
      drawActionField(ctx, 'Location', action.location, width)
      drawActionField(ctx, 'Status', action.status, width)
      drawActionField(ctx, 'Raised by', action.raisedBy, width)

      ctx.y -= 12
    }
  }

  if (unlinkedPhotos.length > 0) {
    newPage(ctx)
    ctx.page.drawText('ADDITIONAL PHOTOS', { x: MARGIN, y: ctx.y, size: 13, font: fonts.bold, color: hexToRgb('#0f4c5c') })
    ctx.y -= 22
    for (const photo of unlinkedPhotos) {
      const ok = await drawPhoto(ctx, photo)
      if (!ok) {
        ctx.y = drawWrappedText(ctx.page, `[Image: ${photo.url}]`, { x: MARGIN, y: ctx.y, width, font: fonts.regular, size: 9 }) - 6
      }
      ctx.y -= 8
    }
  }

  return new Uint8Array(await pdfDoc.save())
}
