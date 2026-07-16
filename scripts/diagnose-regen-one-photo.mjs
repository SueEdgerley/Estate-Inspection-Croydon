#!/usr/bin/env node
/**
 * Diagnose why regenerated PDF still shows one photo.
 * Download current DB PDF URL and count embedded images vs local rebuild.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib'

const ID = '375d457b-8d06-42df-9b93-ae9edbcec558'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function loadEnv(p) {
  if (!existsSync(p)) return
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq < 1) continue
    const k = t.slice(0, eq).trim()
    let v = t.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
      v = v.slice(1, -1)
    if (process.env[k] === undefined) process.env[k] = v
  }
}
loadEnv(join(root, '.env'))
loadEnv(join(root, '.env.local'))
if (!process.env.POSTGRES_URL) {
  process.env.POSTGRES_URL =
    process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL || process.env.DIRECT_URL
}

async function countImages(bytes) {
  const pdfDoc = await PDFDocument.load(bytes)
  let count = 0
  pdfDoc.context.enumerateIndirectObjects().forEach(([, obj]) => {
    if (!(obj instanceof PDFRawStream)) return
    try {
      const subtype = obj.dict.get(PDFName.of('Subtype'))
      if (subtype && subtype.toString() === '/Image') count += 1
    } catch {}
  })
  return { count, pages: pdfDoc.getPageCount(), bytes: bytes.length }
}

const { sql } = await import('@vercel/postgres')
const { buildFullInspectionReportPdfPayload } = await import('@/lib/full-inspection-report-pdf.js')
const { buildInspectionReportPdf } = await import('@/lib/pdf/buildInspectionReportPdf.js')

const insp = (
  await sql`SELECT id, inspector_name, full_pdf_url, pdf_url, pdf_generation_error, submitted_at, template_name
            FROM inspections WHERE id = ${ID}`
).rows[0]

console.log('Inspection:', {
  id: insp.id,
  inspector: insp.inspector_name,
  template: insp.template_name,
  submitted_at: insp.submitted_at,
  full_pdf_url: insp.full_pdf_url,
  pdf_url: insp.pdf_url,
  pdf_generation_error: insp.pdf_generation_error,
})

const photoCount = (
  await sql`SELECT COUNT(*)::int AS n FROM inspection_photos WHERE inspection_id = ${ID}`
).rows[0].n
console.log('DB photo rows:', photoCount)

// Count images in currently stored PDF
if (insp.full_pdf_url) {
  console.log('\nDownloading stored full_pdf_url…')
  const res = await fetch(insp.full_pdf_url)
  console.log('HTTP', res.status, res.headers.get('content-type'), 'cache-control', res.headers.get('cache-control'))
  const buf = Buffer.from(await res.arrayBuffer())
  const stored = await countImages(buf)
  console.log('Stored PDF:', stored, `(${(stored.bytes / 1024 / 1024).toFixed(2)} MB)`)
  mkdirSync(join(root, 'tmp'), { recursive: true })
  writeFileSync(join(root, 'tmp', `stored-${ID}.pdf`), buf)
}

// Rebuild locally with current code
console.log('\nRebuilding with current local renderer…')
const { pdfData } = await buildFullInspectionReportPdfPayload(sql, ID, insp)
console.log('Payload photos:', (pdfData.photos || []).length)
const byQ = new Map()
for (const p of pdfData.photos || []) {
  const q = p.linkedQuestionId || '?'
  byQ.set(q, (byQ.get(q) || 0) + 1)
}
console.log('By question:', Object.fromEntries(byQ))

const bytes = await buildInspectionReportPdf(pdfData)
const rebuilt = await countImages(bytes)
console.log('Rebuilt PDF:', rebuilt, `(${(rebuilt.bytes / 1024 / 1024).toFixed(2)} MB)`)
writeFileSync(join(root, 'tmp', `rebuilt-${ID}.pdf`), Buffer.from(bytes))

console.log('\nDELTA: stored images', insp.full_pdf_url ? 'see above' : 'none', 'vs rebuilt', rebuilt.count)
process.exit(0)
