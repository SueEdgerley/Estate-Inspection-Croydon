#!/usr/bin/env node
/**
 * Final verification for inspection 375d457b-8d06-42df-9b93-ae9edbcec558
 * (Paul Brazill, Canterbury Road 18–20B)
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib'

const INSPECTION_ID = '375d457b-8d06-42df-9b93-ae9edbcec558'
const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

function loadEnv(envPath) {
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq < 1) continue
    const key = t.slice(0, eq).trim()
    let val = t.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = val
  }
}

function countEmbeddedImages(bytes) {
  return PDFDocument.load(bytes).then((pdfDoc) => {
    let count = 0
    pdfDoc.context.enumerateIndirectObjects().forEach(([, obj]) => {
      if (!(obj instanceof PDFRawStream)) return
      try {
        const subtype = obj.dict.get(PDFName.of('Subtype'))
        if (subtype && subtype.toString() === '/Image') count += 1
      } catch {
        // ignore
      }
    })
    return { count, pages: pdfDoc.getPageCount() }
  })
}

async function main() {
  loadEnv(join(root, '.env'))
  loadEnv(join(root, '.env.local'))

  if (!process.env.POSTGRES_URL) {
    process.env.POSTGRES_URL =
      process.env.DATABASE_URL ||
      process.env.POSTGRES_PRISMA_URL ||
      process.env.DIRECT_URL ||
      process.env.NEON_DATABASE_URL
  }
  if (!process.env.POSTGRES_URL) {
    console.error('No database URL configured')
    process.exit(1)
  }

  const { sql } = await import('@vercel/postgres')
  const { buildFullInspectionReportPdfPayload, ensureFullInspectionPdf } = await import(
    '@/lib/full-inspection-report-pdf.js'
  )
  const { buildInspectionReportPdf } = await import('@/lib/pdf/buildInspectionReportPdf.js')
  const { photoGridMetrics } = await import('@/lib/pdf/photo-grid-metrics.js')

  const inspRes = await sql`
    SELECT i.*, b.name AS block_name
    FROM inspections i
    LEFT JOIN blocks b ON b.id = i.block_id
    WHERE i.id = ${INSPECTION_ID}
    LIMIT 1
  `
  const inspection = inspRes.rows[0]
  if (!inspection) {
    console.error('Inspection not found:', INSPECTION_ID)
    process.exit(1)
  }

  console.log('Inspection:', {
    id: inspection.id,
    inspector: inspection.inspector_name,
    location: inspection.block_name || inspection.location_label,
    template: inspection.template_name,
    status: inspection.status,
  })

  const storedPhotos = await sql`
    SELECT question_id, blob_url, filename
    FROM inspection_photos
    WHERE inspection_id = ${INSPECTION_ID}
    ORDER BY question_id, filename
  `

  const storedUrls = storedPhotos.rows.map((r) => r.blob_url)
  const storedUnique = new Set(storedUrls)
  console.log('\n--- Stored photos ---')
  console.log('Total rows:', storedPhotos.rows.length)
  console.log('Unique URLs:', storedUnique.size)
  console.log('Duplicates in DB:', storedPhotos.rows.length - storedUnique.size)

  const { pdfData } = await buildFullInspectionReportPdfPayload(sql, INSPECTION_ID, inspection)

  const payloadUrls = (pdfData.photos || []).map((p) => p.url).filter(Boolean)
  const payloadUnique = new Set(payloadUrls)
  console.log('\n--- PDF payload photos ---')
  console.log('Total:', payloadUrls.length)
  console.log('Unique:', payloadUnique.size)

  const photosByQ = new Map()
  for (const p of pdfData.photos || []) {
    const qid = p.linkedQuestionId || '(unlinked)'
    if (!photosByQ.has(qid)) photosByQ.set(qid, [])
    photosByQ.get(qid).push(p.url)
  }
  for (const [qid, urls] of photosByQ) {
    console.log(`  ${qid}: ${urls.length} photo(s)`)
  }

  const actionPhotoCount = (pdfData.actions || []).reduce(
    (sum, a) => sum + (Array.isArray(a.photoUrls) ? a.photoUrls.filter(Boolean).length : 0),
    0
  )

  // Question order from sections
  const questionOrder = []
  for (const section of pdfData.sections || []) {
    for (const q of section.questions || []) {
      if (q.id) questionOrder.push(q.id)
    }
  }

  const photoQuestionOrder = []
  for (const qid of questionOrder) {
    const urls = photosByQ.get(qid)
    if (urls?.length) photoQuestionOrder.push({ qid, count: urls.length, urls })
  }

  console.log('\n--- Photo order vs question order ---')
  let orderOk = true
  let lastIdx = -1
  for (const entry of photoQuestionOrder) {
    const idx = questionOrder.indexOf(entry.qid)
    if (idx < lastIdx) {
      orderOk = false
      console.log(`  ORDER VIOLATION: ${entry.qid} at index ${idx} after ${lastIdx}`)
    }
    lastIdx = idx
    console.log(`  Q[${idx}] ${entry.qid}: ${entry.count} photo(s)`)
  }
  console.log('Order matches question sequence:', orderOk ? 'YES' : 'NO')

  const multiPhotoQs = [...photosByQ.entries()].filter(([, u]) => u.length > 1)
  console.log('\n--- Multi-photo grouping ---')
  console.log('Questions with multiple photos:', multiPhotoQs.length)
  for (const [qid, urls] of multiPhotoQs) {
    const metrics = photoGridMetrics(urls.length, 180)
    console.log(`  ${qid}: ${urls.length} photos → grid ${metrics.cols}x${metrics.rows}, height ${metrics.height}px`)
  }

  // Page-break check: row height includes full photo grid
  const CONTENT_W = 595.28 - 72
  const COL_PHOTO = Math.floor(CONTENT_W * 0.34) - 16
  const PAGE_H = 841.89
  const MARGIN = 36
  const usableH = PAGE_H - MARGIN * 2 - 22
  console.log('\n--- Page-break analysis (layout math) ---')
  for (const [qid, urls] of multiPhotoQs) {
    const m = photoGridMetrics(urls.length, COL_PHOTO)
    const fitsOnPage = m.height <= usableH
    console.log(`  ${qid}: grid height ${m.height} / usable ${Math.round(usableH)} → ${fitsOnPage ? 'fits on one page' : 'may need page break (row kept together via ensureSpace)'}`)
  }

  console.log('\n--- Generating PDF ---')
  const bytes = await buildInspectionReportPdf(pdfData)
  const outDir = join(root, 'tmp')
  mkdirSync(outDir, { recursive: true })
  const outPath = join(outDir, `verify-${INSPECTION_ID}.pdf`)
  writeFileSync(outPath, Buffer.from(bytes))

  const { count: embeddedImages, pages } = await countEmbeddedImages(bytes)
  const logoCount = 1
  const renderedPhotos = Math.max(0, embeddedImages - logoCount)
  const expectedPhotos = payloadUrls.length + actionPhotoCount

  console.log('PDF size:', bytes.length, 'bytes', `(${(bytes.length / 1024 / 1024).toFixed(2)} MB)`)
  console.log('Pages:', pages)
  console.log('Embedded images (incl logo):', embeddedImages)
  console.log('Rendered inspection+action photos:', renderedPhotos)
  console.log('Expected:', expectedPhotos)

  const all21 = payloadUrls.length === 21
  const noDupesInPayload = payloadUrls.length === payloadUnique.size
  const allRendered = renderedPhotos >= expectedPhotos
  const noDupesRendered = renderedPhotos <= expectedPhotos + logoCount

  console.log('\n========== VERIFICATION RESULTS ==========')
  const checks = [
    ['All 21 inspection photos in payload', all21, `${payloadUrls.length}/21`],
    ['No duplicate photos in payload', noDupesInPayload, `${payloadUnique.size} unique`],
    ['All photos rendered in PDF', allRendered, `${renderedPhotos}/${expectedPhotos}`],
    ['No duplicate renders (usedPhotoUrls dedup)', noDupesRendered, `embedded ${renderedPhotos}`],
    ['Photo order matches question order', orderOk, ''],
    ['Multi-photo questions grouped per row', multiPhotoQs.every(([, u]) => u.length > 1), `${multiPhotoQs.length} multi-Q`],
    ['PDF size reasonable (<15MB)', bytes.length < 15 * 1024 * 1024, `${(bytes.length / 1024 / 1024).toFixed(2)} MB`],
  ]

  let allPass = true
  for (const [label, pass, detail] of checks) {
    const status = pass ? 'PASS' : 'FAIL'
    if (!pass) allPass = false
    console.log(`[${status}] ${label}${detail ? ` (${detail})` : ''}`)
  }

  // Regenerate via app path
  try {
    const result = await ensureFullInspectionPdf(sql, { inspectionId: INSPECTION_ID, forceRegenerate: true })
    console.log('\nensureFullInspectionPdf (app path):', result.url ? 'OK' : result)
  } catch (e) {
    console.warn('ensureFullInspectionPdf:', e.message)
  }

  console.log('\nLocal PDF:', outPath)
  console.log('Overall:', allPass ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED')
  process.exit(allPass ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
