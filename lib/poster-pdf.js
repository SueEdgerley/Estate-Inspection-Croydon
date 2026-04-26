// Estate Walkabout Poster PDF – shared generation logic
import PDFDocument from 'pdfkit'
import sharp from 'sharp'
import { put } from '@vercel/blob'

const MAX_IMAGE_WIDTH = 1200
const JPEG_QUALITY = 0.8

function normalizeCategory(cat) {
  if (!cat || typeof cat !== 'string') return 'Other'
  const c = cat.trim()
  if (!c) return 'Other'
  if (/grounds\s*maintenance\s*and\s*cleaning/i.test(c)) return 'Grounds Maintenance and Cleaning'
  if (/health|safety/i.test(c)) return 'Safety'
  if (/fire/i.test(c)) return 'Fire Safety'
  if (/asb/i.test(c)) return 'ASB'
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

  doc.fontSize(22).font('Helvetica-Bold')
  doc.text(`ESTATE WALKABOUT ISSUES - ${blockName}`, { align: 'center' })
  doc.fontSize(13).font('Helvetica')
  doc.text(`Raised: ${dateStr}`, { align: 'center' })
  if (inspectorName) {
    doc.text(`Inspector: ${inspectorName}`, { align: 'center' })
  }
  doc.moveDown(1.2)

  const actionsBySection = {}
  ;(actions || []).forEach((a) => {
    const cat = normalizeCategory(a.category)
    if (!actionsBySection[cat]) actionsBySection[cat] = []
    actionsBySection[cat].push(a)
  })
  const sectionOrder = Object.keys(actionsBySection)
    .sort((a, b) => a.localeCompare(b))
    .map((key) => ({ key, title: key.toUpperCase() }))

  if (sectionOrder.length === 0) {
    doc.fontSize(14).font('Helvetica')
    doc.text('No issues were raised during this inspection.')
    doc.end()
    return new Promise((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)
    })
  }

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

    doc.fontSize(16).font('Helvetica-Bold')
    doc.text(section.title)
    doc.moveDown(0.5)

    for (const action of items) {
      const base = action.description || action.title || 'Issue'
      const issue = action.location ? `${base} (${action.location})` : base
      let photoUrls = []
      if (Array.isArray(action.photo_urls)) {
        photoUrls = action.photo_urls.filter((u) => typeof u === 'string' && u)
      } else if (typeof action.photo_urls === 'string') {
        try {
          const parsed = JSON.parse(action.photo_urls)
          photoUrls = Array.isArray(parsed) ? parsed.filter((u) => typeof u === 'string' && u) : []
        } catch {}
      }

      doc.fontSize(13).font('Helvetica-Bold')
      doc.text(`- ${issue}`)
      doc.moveDown(0.2)
      if (action.location) {
        doc.fontSize(11).font('Helvetica')
        doc.text(`Location: ${action.location}`)
        doc.moveDown(0.2)
      }
      if (action.order_raised_number) {
        doc.fontSize(11).font('Helvetica')
        doc.text(`Order raised number: ${action.order_raised_number}`)
        doc.moveDown(0.2)
      }
      doc.fontSize(11).font('Helvetica')
      doc.text(`Action update/status: ${action.status || 'Open'} ____________________________________`)
      doc.moveDown(0.2)
      if (photoUrls.length > 0) {
        doc.fontSize(11).font('Helvetica-Bold')
        doc.text('PHOTO(S):')
        doc.font('Helvetica')
        doc.moveDown(0.3)
        for (const url of photoUrls) {
          const imgBuf = await resizeImageForPdf(url)
          if (imgBuf) {
            try {
              doc.image(imgBuf, { width: 320 })
              doc.moveDown(0.5)
            } catch {}
          }
        }
      } else {
        doc.fontSize(10).font('Helvetica')
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
