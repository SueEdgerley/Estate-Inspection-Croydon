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
const RULE_COLOR = hexToRgb('#d1d5db')
const HEADING_COLOR = hexToRgb('#0f4c5c')
const BODY_COLOR = hexToRgb('#111827')
const MUTED_COLOR = rgb(0.35, 0.35, 0.35)

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

function drawHorizontalRule(ctx, width) {
  ensureSpace(ctx, 16)
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y },
    end: { x: MARGIN + width, y: ctx.y },
    thickness: 0.75,
    color: RULE_COLOR,
  })
  ctx.y -= 14
}

async function drawPhoto(ctx, photo, width = 280) {
  const imgBuf = await resizeImageForPdf(photo.url)
  if (!imgBuf) return false
  try {
    const img = await ctx.pdfDoc.embedJpg(imgBuf)
    const maxH = 200
    const scale = Math.min(width / img.width, maxH / img.height, 1)
    const w = img.width * scale
    const h = img.height * scale
    ensureSpace(ctx, h + 20)
    ctx.page.drawImage(img, { x: MARGIN, y: ctx.y - h, width: w, height: h })
    ctx.y -= h + 8
    return true
  } catch (imgErr) {
    console.warn('[PDF] Could not add image:', photo.url, imgErr.message)
    return false
  }
}

function drawLabelValue(ctx, label, value, width, { italic = false } = {}) {
  if (!value || !String(value).trim()) return
  ctx.y = drawWrappedText(ctx.page, `${label}: ${value}`, {
    x: MARGIN,
    y: ctx.y,
    width,
    font: italic ? ctx.fonts.italic : ctx.fonts.regular,
    size: 10,
    color: BODY_COLOR,
    lineHeight: 13,
    maxLines: 6,
  }) - 3
}

function drawSectionHeading(ctx, title, width) {
  ensureSpace(ctx, 40)
  ctx.y = drawWrappedText(ctx.page, title, {
    x: MARGIN,
    y: ctx.y,
    width,
    font: ctx.fonts.bold,
    size: 13,
    color: HEADING_COLOR,
    lineHeight: 16,
    maxLines: 3,
  }) - 10
}

function questionRating(question) {
  if (question.rating && String(question.rating).trim()) return String(question.rating).trim()
  if (question.grade && String(question.grade).trim()) return String(question.grade).trim()
  if (question.answer && String(question.answer).trim()) return String(question.answer).trim()
  return ''
}

/**
 * Build inspection report PDF from template-agnostic data structure.
 *
 * Layout:
 * - Header
 * - Inspection Findings (each question once: title, rating, comment, photo)
 * - Issues Raised (genuine actions only; or “No issues…”)
 * - Additional photos (unlinked)
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
  ctx.y -= 10
  drawHorizontalRule(ctx, width)

  const photosByQuestionId = {}
  photos.forEach((photo) => {
    if (photo.linkedQuestionId) {
      if (!photosByQuestionId[photo.linkedQuestionId]) photosByQuestionId[photo.linkedQuestionId] = []
      photosByQuestionId[photo.linkedQuestionId].push(photo)
    }
  })

  const reportableActions = (actions || []).filter((action) => action.isReportableIssue !== false)
  const hasFindings = sections.some((section) => (section.questions || []).length > 0)

  if (hasFindings) {
    drawSectionHeading(ctx, 'INSPECTION FINDINGS', width)

    for (const section of sections) {
      if (!section.title || !section.questions || section.questions.length === 0) continue

      ensureSpace(ctx, 50)
      ctx.y = drawWrappedText(ctx.page, section.title, {
        x: MARGIN,
        y: ctx.y,
        width,
        font: fonts.bold,
        size: 12,
        color: HEADING_COLOR,
        lineHeight: 15,
        maxLines: 3,
      }) - 8

      for (let qi = 0; qi < section.questions.length; qi += 1) {
        const question = section.questions[qi]
        if (!question.text) continue
        ensureSpace(ctx, 70)

        ctx.y = drawWrappedText(ctx.page, question.text, {
          x: MARGIN,
          y: ctx.y,
          width,
          font: fonts.bold,
          size: 10.5,
          color: BODY_COLOR,
          lineHeight: 13,
          maxLines: 5,
        }) - 4

        const rating = questionRating(question)
        if (rating) {
          drawLabelValue(ctx, 'Rating', rating, width)
        }

        if (question.comment && String(question.comment).trim()) {
          drawLabelValue(ctx, 'Comment', question.comment, width, { italic: true })
        }

        const questionPhotos = photosByQuestionId[question.id] || []
        if (questionPhotos.length > 0) {
          ensureSpace(ctx, 18)
          ctx.page.drawText('Photo', {
            x: MARGIN,
            y: ctx.y,
            size: 10,
            font: fonts.regular,
            color: BODY_COLOR,
          })
          ctx.y -= 14
          for (const photo of questionPhotos) {
            const ok = await drawPhoto(ctx, photo)
            if (!ok) {
              ctx.y = drawWrappedText(ctx.page, 'Photo unavailable for print.', {
                x: MARGIN,
                y: ctx.y,
                width,
                font: fonts.italic,
                size: 9,
                color: MUTED_COLOR,
              }) - 3
            }
          }
        }

        if (qi < section.questions.length - 1) {
          drawHorizontalRule(ctx, width)
        } else {
          ctx.y -= 10
        }
      }

      ctx.y -= 6
    }
  }

  newPage(ctx)
  drawSectionHeading(ctx, 'ISSUES RAISED', width)

  if (reportableActions.length === 0) {
    ctx.y = drawWrappedText(ctx.page, 'No issues were identified during this inspection.', {
      x: MARGIN,
      y: ctx.y,
      width,
      font: fonts.italic,
      size: 11,
      color: MUTED_COLOR,
      lineHeight: 14,
      maxLines: 3,
    }) - 8
  } else {
    for (let i = 0; i < reportableActions.length; i += 1) {
      const action = reportableActions[i]
      ensureSpace(ctx, 100)

      ctx.y = drawWrappedText(ctx.page, `Issue ${i + 1}`, {
        x: MARGIN,
        y: ctx.y,
        width,
        font: fonts.bold,
        size: 11.5,
        color: BODY_COLOR,
        lineHeight: 14,
        maxLines: 2,
      }) - 4

      if (action.title) {
        ctx.y = drawWrappedText(ctx.page, action.title, {
          x: MARGIN,
          y: ctx.y,
          width,
          font: fonts.bold,
          size: 10.5,
          color: BODY_COLOR,
          lineHeight: 13,
          maxLines: 4,
        }) - 4
      }

      drawLabelValue(ctx, 'Category', action.category, width)
      drawLabelValue(ctx, 'Description', action.description || action.issue || action.details, width, {
        italic: true,
      })
      drawLabelValue(ctx, 'Priority', action.priority, width)
      drawLabelValue(ctx, 'Location', action.location, width)
      drawLabelValue(ctx, 'Raised by', action.raisedBy, width)
      drawLabelValue(ctx, 'Status', action.status, width)

      const seenActionPhotoUrls = new Set()
      const actionPhotoUrls = Array.isArray(action.photoUrls)
        ? action.photoUrls
            .map((url) => String(url || '').trim())
            .filter((url) => {
              if (!url || seenActionPhotoUrls.has(url)) return false
              seenActionPhotoUrls.add(url)
              return true
            })
        : []

      if (actionPhotoUrls.length > 0) {
        ensureSpace(ctx, 18)
        ctx.page.drawText('Photo', {
          x: MARGIN,
          y: ctx.y,
          size: 10,
          font: fonts.regular,
          color: BODY_COLOR,
        })
        ctx.y -= 14
        for (const url of actionPhotoUrls) {
          const ok = await drawPhoto(ctx, { url }, width - 20)
          if (!ok) {
            ctx.y = drawWrappedText(ctx.page, 'Photo unavailable for print.', {
              x: MARGIN,
              y: ctx.y,
              width,
              font: fonts.italic,
              size: 9,
              color: MUTED_COLOR,
            }) - 3
          }
        }
      }

      if (i < reportableActions.length - 1) {
        drawHorizontalRule(ctx, width)
      }
    }
  }

  const unlinkedPhotos = photos.filter((p) => !p.linkedQuestionId)
  if (unlinkedPhotos.length > 0) {
    newPage(ctx)
    drawSectionHeading(ctx, 'ADDITIONAL PHOTOS', width)
    for (const photo of unlinkedPhotos) {
      const ok = await drawPhoto(ctx, photo)
      if (!ok) {
        ctx.y = drawWrappedText(ctx.page, 'Photo unavailable for print.', {
          x: MARGIN,
          y: ctx.y,
          width,
          font: fonts.italic,
          size: 9,
          color: MUTED_COLOR,
        }) - 6
      }
      ctx.y -= 8
    }
  }

  return new Uint8Array(await pdfDoc.save())
}
