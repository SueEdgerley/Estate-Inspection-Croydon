// Estate Walkabout Poster PDF – shared generation logic
import PDFDocument from 'pdfkit'
import sharp from 'sharp'
import { put } from '@vercel/blob'

const MAX_IMAGE_WIDTH = 1200
const JPEG_QUALITY = 0.8

const REPAIRS = 'Repairs'
const GROUNDS_MAINTENANCE = 'Grounds Maintenance'
const CLEANING = 'Cleaning'

function normalizeCategory(cat) {
  if (!cat || typeof cat !== 'string') return ''
  const c = cat.trim()
  if (/repair/i.test(c)) return REPAIRS
  if (/grounds|maintenance/i.test(c) && !/cleaning/i.test(c)) return GROUNDS_MAINTENANCE
  if (/cleaning|grounds\s*maintenance\s*and\s*cleaning/i.test(c)) return GROUNDS_MAINTENANCE
  if (/cleaning/i.test(c)) return CLEANING
  return c
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
    const out = await sharp(buf)
      .resize(w, h, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: Math.round(JPEG_QUALITY * 100) })
      .toBuffer()
    return out
  } catch (err) {
    console.warn('[Poster PDF] Could not resize image:', url, err.message)
    return null
  }
}

/** Generate poster PDF and return the buffer (for direct API response, no upload) */
export async function generatePosterPdfBuffer(inspection, actions = []) {
  if (!inspection || !inspection.id) {
    throw new Error('inspection required')
  }

  const blockName = inspection.title || inspection.location_label || 'Block'
  const dateStr = inspection.submitted_at
    ? new Date(inspection.submitted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const inspectorName = inspection.inspector_name || ''

  const doc = new PDFDocument({ margin: 50, size: 'A4' })
  const chunks = []
  doc.on('data', (c) => chunks.push(c))

  doc.fontSize(18).font('Helvetica-Bold')
  doc.text(`ESTATE WALKABOUT – ${blockName} – ${dateStr}`, { align: 'center' })
  if (inspectorName) {
    doc.fontSize(11).font('Helvetica')
    doc.text(inspectorName, { align: 'center' })
  }
  doc.moveDown(1.5)

  const filterCategories = [REPAIRS, GROUNDS_MAINTENANCE, CLEANING]
  const sectionOrder = [
    { key: REPAIRS, title: 'REPAIRS' },
    { key: GROUNDS_MAINTENANCE, title: 'GROUNDS MAINTENANCE AND CLEANING' },
  ]

  const actionsBySection = {}
  ;(actions || []).forEach((a) => {
    const cat = normalizeCategory(a.category)
    if (!filterCategories.includes(cat)) return
    const sectionKey = cat === CLEANING ? GROUNDS_MAINTENANCE : cat
    if (!actionsBySection[sectionKey]) actionsBySection[sectionKey] = []
    actionsBySection[sectionKey].push(a)
  })

  for (const section of sectionOrder) {
    const items = actionsBySection[section.key] || []
    items.sort((a, b) => {
      const pA = (a.priority || '').toLowerCase()
      const pB = (b.priority || '').toLowerCase()
      if (pA !== pB) return pA.localeCompare(pB)
      const locA = (a.location || '').toLowerCase()
      const locB = (b.location || '').toLowerCase()
      if (locA !== locB) return locA.localeCompare(locB)
      return new Date(a.created_at || 0) - new Date(b.created_at || 0)
    })

    doc.fontSize(14).font('Helvetica-Bold')
    doc.text(section.title)
    doc.moveDown(0.5)

    if (items.length === 0) {
      doc.fontSize(10).font('Helvetica')
      doc.text('No actions were raised in this category during this walkabout.', { color: '#666666' })
      doc.moveDown(1)
      continue
    }

    for (const action of items) {
      const base = action.description || action.title || 'Issue'
      const issue = action.location ? `${base} (${action.location})` : base
      const jobNumber = action.job_number || ''
      const expDate = action.expected_completion_date
        ? new Date(action.expected_completion_date).toLocaleDateString('en-GB')
        : ''
      let photoUrls = []
      if (Array.isArray(action.photo_urls)) {
        photoUrls = action.photo_urls.filter((u) => typeof u === 'string' && u)
      } else if (typeof action.photo_urls === 'string') {
        try {
          const parsed = JSON.parse(action.photo_urls)
          photoUrls = Array.isArray(parsed) ? parsed.filter((u) => typeof u === 'string' && u) : []
        } catch {}
      }

      doc.fontSize(10).font('Helvetica-Bold')
      doc.text('ISSUE:')
      doc.font('Helvetica')
      doc.text(issue, { continued: false })
      doc.moveDown(0.3)
      doc.font('Helvetica-Bold')
      doc.text(`JOB NUMBER: ${jobNumber || '(not yet assigned)'}`)
      doc.font('Helvetica')
      doc.text(`EXPECTED COMPLETION DATE: ${expDate || ''}`)
      doc.moveDown(0.3)
      if (photoUrls.length > 0) {
        doc.font('Helvetica-Bold')
        doc.text('PHOTO(S):')
        doc.font('Helvetica')
        doc.moveDown(0.3)
        for (const url of photoUrls) {
          const imgBuf = await resizeImageForPdf(url)
          if (imgBuf) {
            try {
              doc.image(imgBuf, { width: 300 })
              doc.moveDown(0.5)
            } catch {}
          }
        }
      } else {
        doc.font('Helvetica')
        doc.text('(No photo attached)', { color: '#999999' })
        doc.moveDown(0.3)
      }
      doc.moveDown(0.8)
    }
  }

  doc.end()
  return new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
  })
}

/** Generate poster PDF, upload to Blob, return URL (for submit flow) */
export async function generatePosterPdf(inspection, actions = []) {
  const pdfBuffer = await generatePosterPdfBuffer(inspection, actions)
  const filename = `posters/walkabout-${inspection.id}-${Date.now()}.pdf`
  const blob = await put(filename, pdfBuffer, {
    access: 'public',
    contentType: 'application/pdf',
  })
  return blob.url
}
