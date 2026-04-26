import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

export { PDFDocument, StandardFonts, rgb }

export const A4 = [595.28, 841.89]

export function hexToRgb(hex) {
  const clean = String(hex || '').replace('#', '')
  const n = parseInt(clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean, 16)
  if (!Number.isFinite(n)) return rgb(0, 0, 0)
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

export function safeText(value) {
  return String(value ?? '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2022/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\s+/g, ' ')
    .replace(/[^\x20-\x7e\xa0-\xff]/g, '?')
    .trim()
}

export function splitText(text, font, size, maxWidth) {
  const words = safeText(text).split(' ').filter(Boolean)
  const lines = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      line = next
    } else {
      if (line) lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  return lines.length ? lines : ['']
}

export function drawWrappedText(page, text, opts) {
  const {
    x,
    y,
    width,
    font,
    size = 10,
    color = rgb(0, 0, 0),
    lineHeight = size * 1.25,
    maxLines = 999,
  } = opts
  const allLines = splitText(text, font, size, width)
  const lines = allLines.slice(0, maxLines)
  let yy = y
  lines.forEach((line, index) => {
    const suffix = index === maxLines - 1 && allLines.length > maxLines ? '...' : ''
    const drawLine = `${line}${suffix}`
    if (drawLine) page.drawText(drawLine, { x, y: yy, size, font, color })
    yy -= lineHeight
  })
  return yy
}

export async function createStandardPdfDocument() {
  const pdfDoc = await PDFDocument.create()
  const fonts = {
    regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
    bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
    italic: await pdfDoc.embedFont(StandardFonts.HelveticaOblique),
    boldItalic: await pdfDoc.embedFont(StandardFonts.HelveticaBoldOblique),
  }
  return { pdfDoc, fonts }
}
