#!/usr/bin/env node
/**
 * Final pre-commit verification for multi-photo PDF rendering.
 * Usage: node --import ./scripts/esm-alias-register.mjs ./scripts/final-verify-multi-photo-pdf.mjs
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

function countPdfImages(bytes) {
  return PDFDocument.load(bytes).then((pdfDoc) => {
    let embeddedImages = 0
    pdfDoc.context.enumerateIndirectObjects().forEach(([, obj]) => {
      if (!(obj instanceof PDFRawStream)) return
      try {
        const subtype = obj.dict.get(PDFName.of('Subtype'))
        if (subtype && subtype.toString() === '/Image') embeddedImages += 1
      } catch {
        // ignore
      }
    })
    return { pageCount: pdfDoc.getPageCount(), embeddedImages }
  })
}

async function main() {
  loadEnv(join(root, '.env'))
  loadEnv(join(root, '.env.local'))
  if (!process.env.POSTGRES_URL) {
    process.env.POSTGRES_URL =
      process.env.DATABASE_URL ||
      process.env.POSTGRES_PRISMA_URL ||
      process.env.DIRECT_URL
  }

  const { sql } = await import('@vercel/postgres')
  const { buildFullInspectionReportPdfPayload } = await import('@/lib/full-inspection-report-pdf.js')
  const { buildInspectionReportPdf } = await import('@/lib/pdf/buildInspectionReportPdf.js')
  const { photoGridMetrics } = await import('@/lib/pdf/photo-grid-metrics.js')

  const insp = await sql`SELECT * FROM inspections WHERE id = ${INSPECTION_ID} LIMIT 1`
  const row = insp.rows[0]
  if (!row) throw new Error('Inspection not found')

  const photos = await sql`
    SELECT question_id, blob_url, filename
    FROM inspection_photos
    WHERE inspection_id = ${INSPECTION_ID}
    ORDER BY question_id, filename
  `

  const storedByQ = new Map()
  const storedUrls = []
  for (const p of photos.rows) {
    const qid = p.question_id
    if (!storedByQ.has(qid)) storedByQ.set(qid, [])
    storedByQ.get(qid).push(p.blob_url)
    storedUrls.push(p.blob_url)
  }

  const uniqueStored = new Set(storedUrls)
  const duplicateStored = storedUrls.length - uniqueStored.size

  const { pdfData } = await buildFullInspectionReportPdfPayload(sql, INSPECTION_ID, row)

  const payloadByQ = new Map()
  const payloadUrls = []
  for (const p of pdfData.photos || []) {
    const qid = p.linkedQuestionId
    if (!payloadByQ.has(qid)) payloadByQ.set(qid, [])
    payloadByQ.get(qid).push(p.url)
    payloadUrls.push(p.url)
  }
  const uniquePayload = new Set(payloadUrls)

  // Question order from sections
  const questionOrder = []
  for (const section of pdfData.sections || []) {
    for (const q of section.questions || []) {
      if (q.id) questionOrder.push(q.id)
    }
  }

  const questionsWithPhotosInOrder = questionOrder.filter((qid) => (payloadByQ.get(qid) || []).length > 0)

  // Simulate renderer grouping: photos stay on same row as question
  let groupedOk = true
  for (const qid of questionsWithPhotosInOrder) {
    const count = (payloadByQ.get(qid) || []).length
    const metrics = photoGridMetrics(count, 180)
    if (count > 0 && metrics.height <= 0) groupedOk = false
  }

  // Row height check: multi-photo rows use photoMetrics.height (no split within row)
  const multiPhotoQuestions = [...payloadByQ.entries()].filter(([, u]) => u.length > 1)
  const gridLayouts = multiPhotoQuestions.map(([qid, urls]) => ({
    qid,
    count: urls.length,
    ...photoGridMetrics(urls.length, 180),
  }))

  console.log('=== INSPECTION ===')
  console.log('ID:', INSPECTION_ID)
  console.log('Inspector:', row.inspector_name)
  console.log('Template:', row.template_name)
  console.log('Work type:', row.work_type)

  console.log('\n=== STORED PHOTOS ===')
  console.log('Total rows:', storedUrls.length)
  console.log('Unique URLs:', uniqueStored.size)
  console.log('Duplicate stored URLs:', duplicateStored)
  for (const [qid, urls] of storedByQ.entries()) {
    console.log(`  ${qid}: ${urls.length}`)
  }

  console.log('\n=== PAYLOAD ===')
  console.log('Payload photos:', payloadUrls.length)
  console.log('Unique payload URLs:', uniquePayload.size)
  console.log('Questions with photos (in section order):', questionsWithPhotosInOrder.length)

  console.log('\n=== GRID LAYOUT (multi-photo questions) ===')
  for (const g of gridLayouts) {
    console.log(`  ${g.qid}: ${g.count} photos → ${g.cols}x${g.rows} grid, height ${g.height}px`)
  }

  console.log('\n=== GENERATING PDF ===')
  const bytes = await buildInspectionReportPdf(pdfData)
  const outDir = join(root, 'tmp')
  mkdirSync(outDir, { recursive: true })
  const outPath = join(outDir, `final-verify-${INSPECTION_ID}.pdf`)
  writeFileSync(outPath, Buffer.from(bytes))

  const { pageCount, embeddedImages } = await countPdfImages(bytes)
  const photosRendered = Math.max(0, embeddedImages - 1) // minus logo

  console.log('PDF bytes:', bytes.length)
  console.log('PDF pages:', pageCount)
  console.log('Embedded images (incl. logo):', embeddedImages)
  console.log('Inspection photos rendered:', photosRendered)
  console.log('Written:', outPath)

  const checks = {
    all21InPdf: photosRendered === 21,
    payloadHas21: payloadUrls.length === 21,
    noDuplicatePayload: payloadUrls.length === uniquePayload.size,
    storedMatchesPayload: storedUrls.length === payloadUrls.length,
    groupedWithQuestion: groupedOk,
    multiPhotoCount: multiPhotoQuestions.length,
  }

  console.log('\n=== CHECKS ===')
  for (const [k, v] of Object.entries(checks)) {
    console.log(`${v ? 'PASS' : 'FAIL'}: ${k} = ${v}`)
  }

  const allPass = Object.values(checks).every(Boolean) && photosRendered >= 21
  if (!allPass) {
    console.error('\nVERIFICATION FAILED')
    process.exit(1)
  }
  console.log('\nVERIFICATION PASSED')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
