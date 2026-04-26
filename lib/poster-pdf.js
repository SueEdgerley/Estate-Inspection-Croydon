// Estate Walkabout Poster PDF – Vercel-safe pdf-lib generation.
import sharp from 'sharp'
import { put } from '@vercel/blob'
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
const MARGIN = 48

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
    return await sharp(buf)
      .resize(w, h, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: Math.round(JPEG_QUALITY * 100) })
      .toBuffer()
  } catch (err) {
    console.warn('[Poster PDF] Could not resize image:', url, err.message)
    return null
  }
}

function photoUrlsFromAction(action) {
  if (Array.isArray(action.photo_urls)) return action.photo_urls.filter((u) => typeof u === 'string' && u)
  if (typeof action.photo_urls === 'string') {
    try {
      const parsed = JSON.parse(action.photo_urls)
      return Array.isArray(parsed) ? parsed.filter((u) => typeof u === 'string' && u) : []
    } catch {}
  }
  return []
}

function addPage(pdfDoc) {
  return pdfDoc.addPage(A4)
}

function ensureSpace(ctx, needed) {
  if (ctx.y - needed >= MARGIN) return
  ctx.page = addPage(ctx.pdfDoc)
  ctx.y = A4[1] - MARGIN
}

async function drawPhoto(ctx, url) {
  const imgBuf = await resizeImageForPdf(url)
  if (!imgBuf) return false
  try {
    const img = await ctx.pdfDoc.embedJpg(imgBuf)
    const maxW = 320
    const maxH = 220
    const scale = Math.min(maxW / img.width, maxH / img.height, 1)
    const w = img.width * scale
    const h = img.height * scale
    ensureSpace(ctx, h + 16)
    ctx.page.drawImage(img, { x: MARGIN, y: ctx.y - h, width: w, height: h })
    ctx.y -= h + 12
    return true
  } catch {
    return false
  }
}

/** Generate poster PDF and return the buffer (for direct API response, no upload) */
export async function generatePosterPdfBuffer(inspection, actions = []) {
  if (!inspection || !inspection.id) throw new Error('inspection required')

  const { pdfDoc, fonts } = await createStandardPdfDocument()
  const ctx = { pdfDoc, page: addPage(pdfDoc), y: A4[1] - MARGIN }
  const width = A4[0] - MARGIN * 2
  const blockName = inspection.title || inspection.location_label || 'Block'
  const dateStr = inspection.submitted_at
    ? new Date(inspection.submitted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

  ctx.page.drawText(`ESTATE WALKABOUT ISSUES - ${safeText(blockName).slice(0, 60)}`, {
    x: MARGIN,
    y: ctx.y,
    size: 18,
    font: fonts.bold,
    color: hexToRgb('#0f172a'),
  })
  ctx.y -= 24
  ctx.page.drawText(`Raised: ${dateStr}`, { x: MARGIN, y: ctx.y, size: 11, font: fonts.regular })
  ctx.y -= 16
  if (inspection.inspector_name) {
    ctx.page.drawText(`Inspector: ${safeText(inspection.inspector_name)}`, { x: MARGIN, y: ctx.y, size: 11, font: fonts.regular })
    ctx.y -= 18
  }
  ctx.y -= 10

  const actionsBySection = {}
  ;(actions || []).forEach((a) => {
    const cat = normalizeCategory(a.category)
    if (!actionsBySection[cat]) actionsBySection[cat] = []
    actionsBySection[cat].push(a)
  })
  const sectionOrder = Object.keys(actionsBySection).sort((a, b) => a.localeCompare(b))

  if (sectionOrder.length === 0) {
    ctx.page.drawText('No issues were raised during this inspection.', { x: MARGIN, y: ctx.y, size: 12, font: fonts.regular })
    return Buffer.from(await pdfDoc.save())
  }

  for (const sectionKey of sectionOrder) {
    ensureSpace(ctx, 60)
    ctx.page.drawText(sectionKey.toUpperCase(), { x: MARGIN, y: ctx.y, size: 14, font: fonts.bold, color: hexToRgb('#0f4c5c') })
    ctx.y -= 20

    const items = actionsBySection[sectionKey] || []
    items.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0))
    for (const action of items) {
      ensureSpace(ctx, 100)
      const base = action.description || action.title || 'Issue'
      const issue = action.location ? `${base} (${action.location})` : base
      ctx.y = drawWrappedText(ctx.page, `- ${issue}`, {
        x: MARGIN,
        y: ctx.y,
        width,
        font: fonts.bold,
        size: 11,
        color: hexToRgb('#111827'),
        lineHeight: 14,
        maxLines: 4,
      }) - 4
      if (action.location) {
        ctx.y = drawWrappedText(ctx.page, `Location: ${action.location}`, { x: MARGIN, y: ctx.y, width, font: fonts.regular, size: 10 }) - 2
      }
      if (action.order_raised_number) {
        ctx.y = drawWrappedText(ctx.page, `Order raised number: ${action.order_raised_number}`, { x: MARGIN, y: ctx.y, width, font: fonts.regular, size: 10 }) - 2
      }
      ctx.y = drawWrappedText(ctx.page, `Action update/status: ${action.status || 'Open'} ______________________________`, {
        x: MARGIN,
        y: ctx.y,
        width,
        font: fonts.regular,
        size: 10,
      }) - 6

      const urls = photoUrlsFromAction(action)
      if (urls.length > 0) {
        ctx.page.drawText('PHOTO(S):', { x: MARGIN, y: ctx.y, size: 10, font: fonts.bold })
        ctx.y -= 14
        for (const url of urls) {
          const ok = await drawPhoto(ctx, url)
          if (!ok) {
            ctx.y = drawWrappedText(ctx.page, `Photo: ${url}`, { x: MARGIN, y: ctx.y, width, font: fonts.regular, size: 9, color: rgb(0.35, 0.35, 0.35) }) - 2
          }
        }
      } else {
        ctx.page.drawText('(No photo attached)', { x: MARGIN, y: ctx.y, size: 9, font: fonts.italic, color: rgb(0.5, 0.5, 0.5) })
        ctx.y -= 14
      }
      ctx.y -= 12
    }
  }

  return Buffer.from(await pdfDoc.save())
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
