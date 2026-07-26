/**
 * Shared multi-photo drawing for inspection PDFs (Caretaker-style grid).
 * Used by full inspection reports and compact action posters.
 */

import { photoGridMetrics } from '@/lib/pdf/photo-grid-metrics'

/**
 * Draw all action photos in a rectangular area using the shared grid metrics.
 *
 * @param {object} ctx - { page, pdfDoc }
 * @param {string[]} urls
 * @param {{
 *   x: number,
 *   y: number,
 *   width: number,
 *   height: number,
 *   loadJpeg: (url: string) => Promise<Buffer|null>,
 *   usedUrls?: Set<string>,
 *   borderColor?: object,
 *   backgroundColor?: object,
 * }} options
 *   y is the TOP of the area (pdf-lib style).
 * @returns {Promise<{ drawn: number, usedHeight: number }>}
 */
export async function drawActionPhotoGrid(ctx, urls, options) {
  const {
    x,
    y,
    width,
    height,
    loadJpeg,
    usedUrls = new Set(),
    borderColor = null,
    backgroundColor = null,
  } = options

  const list = (urls || [])
    .map((u) => String(u || '').trim())
    .filter((u) => u && !usedUrls.has(u))

  if (!list.length || height <= 0 || width <= 0) {
    return { drawn: 0, usedHeight: 0 }
  }

  const metrics = photoGridMetrics(list.length, width, {
    photoBoxW: Math.min(160, width),
    photoBoxH: Math.min(58, Math.max(40, height - 8)),
    pad: 4,
    gap: 4,
    multiMinW: 72,
  })

  // Fit grid into available height by shrinking thumbs if needed.
  let thumbW = metrics.thumbW
  let thumbH = metrics.thumbH
  let gap = metrics.gap
  let cols = metrics.cols
  let rows = metrics.rows
  let gridH = metrics.pad * 2 + rows * thumbH + (rows - 1) * gap
  if (gridH > height && rows > 0) {
    const available = Math.max(24, height - metrics.pad * 2 - (rows - 1) * gap)
    thumbH = Math.floor(available / rows)
    thumbW = Math.min(thumbW, Math.max(40, Math.round(thumbH / 0.55)))
    gridH = metrics.pad * 2 + rows * thumbH + (rows - 1) * gap
  }

  const gridW = cols * thumbW + (cols - 1) * gap
  const originX = x + Math.max(0, (width - gridW) / 2)
  const originTop = y - Math.max(0, (height - gridH) / 2) - metrics.pad

  if (backgroundColor || borderColor) {
    ctx.page.drawRectangle({
      x,
      y: y - height,
      width,
      height,
      color: backgroundColor || undefined,
      borderColor: borderColor || undefined,
      borderWidth: borderColor ? 1 : undefined,
    })
  }

  let drawn = 0
  for (let i = 0; i < list.length; i++) {
    const url = list[i]
    const col = i % cols
    const row = Math.floor(i / cols)
    const frameX = originX + col * (thumbW + gap)
    const frameTop = originTop - row * (thumbH + gap)
    const frameBottom = frameTop - thumbH

    const imgBuf = await loadJpeg(url)
    if (!imgBuf) continue
    try {
      const img = await ctx.pdfDoc.embedJpg(imgBuf)
      const scale = Math.min(thumbW / img.width, thumbH / img.height, 1)
      const w = img.width * scale
      const h = img.height * scale
      const drawX = frameX + (thumbW - w) / 2
      const drawY = frameBottom + (thumbH - h) / 2
      ctx.page.drawImage(img, { x: drawX, y: drawY, width: w, height: h })
      usedUrls.add(url)
      drawn += 1
    } catch (err) {
      console.warn('[PDF] Could not embed action photo:', url, err?.message || err)
    }
  }

  return { drawn, usedHeight: gridH }
}

/**
 * Stack photos below an action (full-width report style), wrapping in rows of up to 3.
 * Returns the new y (below the last row).
 */
export async function drawActionPhotoStack(ctx, urls, {
  x,
  y,
  width,
  loadJpeg,
  usedUrls = new Set(),
  ensureSpace,
  labelFont,
  labelSize = 9,
  labelColor,
  gap = 4,
  minThumbW = 72,
  maxThumbH = 58,
}) {
  const list = (urls || [])
    .map((u) => String(u || '').trim())
    .filter((u) => u && !usedUrls.has(u))
  if (!list.length) return y

  let cursorY = y
  if (labelFont && labelColor) {
    ctx.page.drawText(list.length === 1 ? 'Photo' : `Photos (${list.length})`, {
      x,
      y: cursorY,
      size: labelSize,
      font: labelFont,
      color: labelColor,
    })
    cursorY -= 12
  }

  const cols = Math.min(3, Math.max(1, Math.floor((width + gap) / (minThumbW + gap))))
  const thumbW = Math.floor((width - gap * (cols - 1)) / cols)
  const thumbH = Math.max(44, Math.min(maxThumbH, Math.round(thumbW * 0.55)))

  let idx = 0
  let drawnAny = false
  while (idx < list.length) {
    if (typeof ensureSpace === 'function') {
      ensureSpace(ctx, thumbH + 10)
      // After a page break, continue from the new page cursor.
      if (typeof ctx.y === 'number') cursorY = ctx.y
    }
    const rowBottom = cursorY - thumbH
    const rowCount = Math.min(cols, list.length - idx)
    for (let c = 0; c < rowCount; c++) {
      const url = list[idx + c]
      const imgBuf = await loadJpeg(url)
      if (!imgBuf) continue
      try {
        const img = await ctx.pdfDoc.embedJpg(imgBuf)
        const scale = Math.min(thumbW / img.width, thumbH / img.height, 1)
        const w = img.width * scale
        const h = img.height * scale
        const drawX = x + c * (thumbW + gap) + (thumbW - w) / 2
        const drawY = rowBottom + (thumbH - h) / 2
        ctx.page.drawImage(img, { x: drawX, y: drawY, width: w, height: h })
        usedUrls.add(url)
        drawnAny = true
      } catch (err) {
        console.warn('[PDF] Could not embed action photo:', url, err?.message || err)
      }
    }
    idx += rowCount
    cursorY = rowBottom - gap
    if (typeof ctx.y === 'number') ctx.y = cursorY
  }

  return { y: cursorY, drawnAny }
}
