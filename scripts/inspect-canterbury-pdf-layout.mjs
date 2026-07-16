#!/usr/bin/env node
/**
 * Analyse image placements in the Canterbury stored PDF.
 * Also render page thumbnails via pdfjs if available, else dump placement math.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PDFDocument, PDFName, PDFRawStream, PDFDict, PDFArray, PDFNumber, PDFHexString, PDFString } from 'pdf-lib'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pdfPath = join(root, 'tmp', 'stored-375d457b-8d06-42df-9b93-ae9edbcec558.pdf')
const outDir = join(root, 'tmp', 'canterbury-pages')

function decodeStream(stream) {
  // pdf-lib gives decoded contents for most streams via getContents
  try {
    return Buffer.from(stream.getContents()).toString('latin1')
  } catch {
    return ''
  }
}

function findDoOps(content) {
  // Match "/ImN Do" or "/ImageN Do" etc.
  const ops = []
  const re = /\/([A-Za-z0-9_.]+)\s+Do/g
  let m
  while ((m = re.exec(content))) {
    ops.push({ name: m[1], index: m.index })
  }
  return ops
}

function findCmBefore(content, atIndex) {
  // Look backwards for the nearest "a b c d e f cm" before Do
  const slice = content.slice(Math.max(0, atIndex - 400), atIndex)
  const matches = [...slice.matchAll(/([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+cm/g)]
  if (!matches.length) return null
  const last = matches[matches.length - 1]
  return {
    a: +last[1],
    b: +last[2],
    c: +last[3],
    d: +last[4],
    e: +last[5], // x
    f: +last[6], // y
  }
}

async function main() {
  if (!existsSync(pdfPath)) {
    console.error('Missing', pdfPath)
    process.exit(1)
  }
  const bytes = readFileSync(pdfPath)
  const pdfDoc = await PDFDocument.load(bytes)
  const pages = pdfDoc.getPages()
  console.log('Pages:', pages.length)
  console.log('Size:', bytes.length, 'bytes')

  mkdirSync(outDir, { recursive: true })

  let totalImagesDrawn = 0
  const placements = []

  for (let pi = 0; pi < pages.length; pi++) {
    const page = pages[pi]
    const { width, height } = page.getSize()
    const node = page.node
    const contents = node.Contents()
    let contentStr = ''
    if (contents instanceof PDFArray) {
      for (let i = 0; i < contents.size(); i++) {
        const ref = contents.lookup(i)
        if (ref instanceof PDFRawStream) contentStr += decodeStream(ref)
      }
    } else if (contents instanceof PDFRawStream) {
      contentStr = decodeStream(contents)
    } else {
      // may be a ref
      try {
        const resolved = page.node.context.lookup(contents)
        if (resolved instanceof PDFRawStream) contentStr = decodeStream(resolved)
        else if (resolved instanceof PDFArray) {
          for (let i = 0; i < resolved.size(); i++) {
            const ref = resolved.lookup(i)
            if (ref instanceof PDFRawStream) contentStr += decodeStream(ref)
          }
        }
      } catch (e) {
        console.warn('page', pi, 'content decode fail', e.message)
      }
    }

    const dos = findDoOps(contentStr)
    console.log(`\nPage ${pi + 1}: ${width.toFixed(1)}x${height.toFixed(1)}, Do ops: ${dos.length}`)

    // Collect XObject image names from Resources
    const resources = page.node.Resources()
    const xobjects = resources?.lookup(PDFName.of('XObject'))
    const imageNames = new Set()
    if (xobjects instanceof PDFDict) {
      const entries = xobjects.entries()
      for (const [name, ref] of entries) {
        try {
          const obj = page.node.context.lookup(ref)
          if (obj instanceof PDFRawStream) {
            const subtype = obj.dict.get(PDFName.of('Subtype'))
            if (subtype && subtype.toString() === '/Image') {
              imageNames.add(name.toString().replace(/^\//, ''))
            }
          }
        } catch {}
      }
    }

    for (const op of dos) {
      if (!imageNames.has(op.name) && !op.name.match(/^(Im|Image|X)/i)) {
        // still check — logo may be named differently
      }
      const cm = findCmBefore(contentStr, op.index)
      const isImage = imageNames.has(op.name)
      if (!isImage && !imageNames.size) {
        // assume Do on images when we can't resolve
      }
      if (isImage || imageNames.size === 0) {
        totalImagesDrawn += isImage ? 1 : 0
        const entry = {
          page: pi + 1,
          name: op.name,
          isImage,
          x: cm?.e,
          y: cm?.f,
          w: cm?.a,
          h: cm?.d,
        }
        placements.push(entry)
        if (isImage) {
          console.log(
            `  ${op.name}: x=${cm?.e?.toFixed?.(1)} y=${cm?.f?.toFixed?.(1)} w=${cm?.a?.toFixed?.(1)} h=${cm?.d?.toFixed?.(1)}`
          )
        }
      }
    }

    // Overlap check among image placements on this page
    const imgs = placements.filter((p) => p.page === pi + 1 && p.isImage && p.x != null)
    let overlaps = 0
    for (let i = 0; i < imgs.length; i++) {
      for (let j = i + 1; j < imgs.length; j++) {
        const a = imgs[i]
        const b = imgs[j]
        const ax2 = a.x + Math.abs(a.w)
        const ay2 = a.y + Math.abs(a.h)
        const bx2 = b.x + Math.abs(b.w)
        const by2 = b.y + Math.abs(b.h)
        const overlapX = a.x < bx2 && ax2 > b.x
        const overlapY = a.y < by2 && ay2 > b.y
        if (overlapX && overlapY) {
          const ox = Math.min(ax2, bx2) - Math.max(a.x, b.x)
          const oy = Math.min(ay2, by2) - Math.max(a.y, b.y)
          const area = ox * oy
          const minArea = Math.min(Math.abs(a.w * a.h), Math.abs(b.w * b.h))
          if (area > minArea * 0.5) {
            overlaps += 1
            console.log(
              `  OVERLAP: ${a.name}@(${a.x.toFixed(0)},${a.y.toFixed(0)}) vs ${b.name}@(${b.x.toFixed(0)},${b.y.toFixed(0)}) area=${area.toFixed(0)}`
            )
          }
        }
      }
    }
    console.log(`  Image placements with coords: ${imgs.length}, significant overlaps: ${overlaps}`)
  }

  writeFileSync(join(outDir, 'placements.json'), JSON.stringify(placements, null, 2))
  console.log('\nTotal image Do ops tagged:', placements.filter((p) => p.isImage).length)
  console.log('Wrote', join(outDir, 'placements.json'))

  // Try pdfjs render
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), disableWorker: true }).promise
    const sharp = (await import('sharp')).default
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      const viewport = page.getViewport({ scale: 1.5 })
      // No canvas — skip full render unless we have node canvas
      console.log(`pdfjs page ${i} viewport ${viewport.width}x${viewport.height}`)
    }
  } catch (e) {
    console.log('pdfjs render unavailable:', e.message)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
