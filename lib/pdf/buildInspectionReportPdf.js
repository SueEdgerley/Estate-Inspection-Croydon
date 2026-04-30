// Template-agnostic PDF builder for inspection reports.
// Uses pdf-lib standard fonts to avoid pdfkit Helvetica.afm resolution on Vercel.

import sharp from 'sharp'
import {
  A4,
  createStandardPdfDocument,
  drawWrappedText,
  hexToRgb,
  rgb,
  safeText,
} from '@/lib/pdf/pdfLibHelpers'

const MAX_IMAGE_WIDTH = 1200
const JPEG_QUALITY = 0.8
const MARGIN = 50

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
    sections = [],
    photos = [],
    actions = [],
  } = data

  const dateStr = completedAt
    ? new Date(completedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

  const { pdfDoc, fonts } = await createStandardPdfDocument()
  const ctx = { pdfDoc, fonts, page: null, y: 0 }
  newPage(ctx)
  const width = A4[0] - MARGIN * 2

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
      ensureSpace(ctx, 70)
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

      if (action.comment) {
        ctx.y = drawWrappedText(ctx.page, `Comment: ${action.comment}`, {
          x: MARGIN + 10,
          y: ctx.y,
          width: width - 10,
          font: fonts.italic,
          size: 9.5,
          color: rgb(0.35, 0.35, 0.35),
          lineHeight: 12,
          maxLines: 6,
        }) - 2
      }

      if (action.description && action.description !== action.comment) {
        ctx.y = drawWrappedText(ctx.page, `Description: ${action.description}`, {
          x: MARGIN + 10,
          y: ctx.y,
          width: width - 10,
          font: fonts.regular,
          size: 9.5,
          color: rgb(0.2, 0.2, 0.2),
          lineHeight: 12,
          maxLines: 6,
        }) - 2
      }

      const meta = [action.category, action.location, action.status]
        .filter(Boolean)
        .join(' · ')
      if (meta) {
        ctx.y = drawWrappedText(ctx.page, meta, {
          x: MARGIN + 10,
          y: ctx.y,
          width: width - 10,
          font: fonts.regular,
          size: 9,
          color: rgb(0.45, 0.45, 0.45),
          lineHeight: 11,
          maxLines: 2,
        }) - 2
      }

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
