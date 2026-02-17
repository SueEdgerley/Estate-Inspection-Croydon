// Template-agnostic PDF builder for inspection reports
// Works with any template structure - sections, questions, answers, photos

import PDFDocument from 'pdfkit'
import sharp from 'sharp'

const MAX_IMAGE_WIDTH = 1200
const JPEG_QUALITY = 0.8

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
    const out = await sharp(buf)
      .resize(w, h, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: Math.round(JPEG_QUALITY * 100) })
      .toBuffer()
    return out
  } catch (err) {
    console.warn('[PDF] Could not resize image:', url, err.message)
    return null
  }
}

/**
 * Build inspection report PDF from template-agnostic data structure
 * 
 * @param {Object} data - Inspection data
 * @param {string} data.inspectionId - Inspection ID
 * @param {string} data.templateName - Template name
 * @param {string} data.blockName - Block/Estate name (from title or location)
 * @param {string} data.completedAt - ISO date string
 * @param {string} data.officerName - Inspector name
 * @param {Array} data.sections - Array of sections
 * @param {string} data.sections[].title - Section title
 * @param {Array} data.sections[].questions - Questions in section
 * @param {string} data.sections[].questions[].text - Question text
 * @param {string} data.sections[].questions[].answer - Answer value
 * @param {string} [data.sections[].questions[].comment] - Comment/notes
 * @param {string} [data.sections[].questions[].grade] - Grade (A/B/C/D/NA)
 * @param {boolean} [data.sections[].questions[].actionCreated] - Whether action was created
 * @param {Array} data.photos - Array of photos
 * @param {string} data.photos[].url - Photo URL
 * @param {string} [data.photos[].caption] - Photo caption
 * @param {string} [data.photos[].linkedQuestionId] - Question ID this photo belongs to
 * @returns {Promise<Uint8Array>} PDF bytes
 */
export async function buildInspectionReportPdf(data) {
  const {
    inspectionId,
    templateName = 'Template',
    blockName = 'Block',
    completedAt,
    officerName = 'Officer',
    sections = [],
    photos = [],
  } = data

  // Format date
  const dateStr = completedAt
    ? new Date(completedAt).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : new Date().toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })

  // Create PDF document
  const doc = new PDFDocument({ margin: 50, size: 'A4' })
  const chunks = []
  doc.on('data', (c) => chunks.push(c))

  // Header
  doc.fontSize(18).font('Helvetica-Bold')
  doc.text(`${templateName.toUpperCase()} – ${blockName}`, { align: 'center' })
  doc.fontSize(12).font('Helvetica')
  doc.text(`Completed: ${dateStr}`, { align: 'center' })
  if (officerName) {
    doc.text(`Inspector: ${officerName}`, { align: 'center' })
  }
  doc.moveDown(1.5)

  // Group photos by question ID for easy lookup
  const photosByQuestionId = {}
  photos.forEach((photo) => {
    if (photo.linkedQuestionId) {
      if (!photosByQuestionId[photo.linkedQuestionId]) {
        photosByQuestionId[photo.linkedQuestionId] = []
      }
      photosByQuestionId[photo.linkedQuestionId].push(photo)
    }
  })

  // Render each section
  for (const section of sections) {
    if (!section.title || !section.questions || section.questions.length === 0) {
      continue
    }

    // Section header
    doc.fontSize(14).font('Helvetica-Bold')
    doc.text(section.title.toUpperCase())
    doc.moveDown(0.5)

    // Render questions
    for (const question of section.questions) {
      if (!question.text) continue

      doc.fontSize(11).font('Helvetica-Bold')
      doc.text(question.text)
      doc.moveDown(0.2)

      // Answer
      doc.fontSize(10).font('Helvetica')
      const answerText = question.answer || question.answerValue || ''
      const gradeText = question.grade ? ` (${question.grade})` : ''
      doc.text(`Answer: ${answerText}${gradeText}`)

      // Comment if present
      if (question.comment && question.comment.trim()) {
        doc.moveDown(0.2)
        doc.font('Helvetica-Oblique')
        doc.text(`Comment: ${question.comment}`, { indent: 20 })
        doc.font('Helvetica')
      }

      // Action created indicator
      if (question.actionCreated) {
        doc.moveDown(0.2)
        doc.font('Helvetica-Bold')
        doc.fillColor('#dc2626')
        doc.text('⚠ Action created', { indent: 20 })
        doc.fillColor('#000000')
        doc.font('Helvetica')
      }

      // Photos for this question
      const questionPhotos = photosByQuestionId[question.id] || []
      if (questionPhotos.length > 0) {
        doc.moveDown(0.3)
        doc.font('Helvetica-Bold')
        doc.text('Photo(s):')
        doc.font('Helvetica')
        doc.moveDown(0.2)

        for (const photo of questionPhotos) {
          try {
            const imgBuf = await resizeImageForPdf(photo.url)
            if (imgBuf) {
              doc.image(imgBuf, { width: 300, align: 'left' })
              if (photo.caption) {
                doc.fontSize(9).font('Helvetica-Oblique')
                doc.text(photo.caption, { indent: 20 })
                doc.fontSize(10).font('Helvetica')
              }
              doc.moveDown(0.3)
            }
          } catch (imgErr) {
            console.warn('[PDF] Could not add image:', photo.url, imgErr.message)
            doc.text(`[Image: ${photo.url}]`, { indent: 20 })
            doc.moveDown(0.2)
          }
        }
      }

      doc.moveDown(0.5)
    }

    doc.moveDown(1)
  }

  // Add any unlinked photos at the end
  const unlinkedPhotos = photos.filter((p) => !p.linkedQuestionId)
  if (unlinkedPhotos.length > 0) {
    doc.addPage()
    doc.fontSize(14).font('Helvetica-Bold')
    doc.text('ADDITIONAL PHOTOS')
    doc.moveDown(0.5)
    doc.fontSize(10).font('Helvetica')

    for (const photo of unlinkedPhotos) {
      try {
        const imgBuf = await resizeImageForPdf(photo.url)
        if (imgBuf) {
          doc.image(imgBuf, { width: 300 })
          if (photo.caption) {
            doc.fontSize(9).font('Helvetica-Oblique')
            doc.text(photo.caption)
            doc.fontSize(10).font('Helvetica')
          }
          doc.moveDown(0.5)
        }
      } catch (imgErr) {
        console.warn('[PDF] Could not add unlinked image:', photo.url, imgErr.message)
        doc.text(`[Image: ${photo.url}]`)
        doc.moveDown(0.3)
      }
    }
  }

  doc.end()

  return new Promise((resolve, reject) => {
    doc.on('end', () => {
      const buffer = Buffer.concat(chunks)
      resolve(new Uint8Array(buffer))
    })
    doc.on('error', reject)
  })
}
