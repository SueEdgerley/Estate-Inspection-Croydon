/**
 * Shared photo-grid layout for inspection report PDFs (no path-alias deps).
 */

export const PHOTO_GAP = 4
export const PHOTO_MULTI_MIN_W = 72
export const PHOTO_CELL_PAD = 4

/**
 * Layout metrics for one or more photos inside a findings-table photo cell.
 * Single photo keeps a large frame; multiple photos wrap in a grid with a small gap.
 */
export function photoGridMetrics(
  photoCount,
  cellWidth,
  {
    photoBoxW = 160,
    photoBoxH = 58,
    pad = PHOTO_CELL_PAD,
    gap = PHOTO_GAP,
    multiMinW = PHOTO_MULTI_MIN_W,
  } = {}
) {
  const count = Math.max(0, Number(photoCount) || 0)
  const available = Math.max(0, cellWidth - pad * 2)
  if (count <= 0) {
    return { cols: 1, rows: 0, thumbW: photoBoxW, thumbH: photoBoxH, gap, pad, height: 0 }
  }
  if (count === 1) {
    const thumbW = Math.min(photoBoxW, available)
    const thumbH = photoBoxH
    return {
      cols: 1,
      rows: 1,
      thumbW,
      thumbH,
      gap,
      pad,
      height: pad * 2 + thumbH,
    }
  }
  const cols = available >= multiMinW * 2 + gap ? 2 : 1
  const thumbW = Math.floor((available - gap * (cols - 1)) / cols)
  const thumbH = Math.max(40, Math.min(photoBoxH, Math.round(thumbW * (photoBoxH / Math.max(photoBoxW, 1)))))
  const rows = Math.ceil(count / cols)
  return {
    cols,
    rows,
    thumbW,
    thumbH,
    gap,
    pad,
    height: pad * 2 + rows * thumbH + (rows - 1) * gap,
  }
}
