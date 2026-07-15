#!/usr/bin/env node
/**
 * Find Paul Brazil / Canterbury Road inspection, count stored photos,
 * regenerate the full report PDF, and count embedded images.
 *
 * Usage:
 *   node --import ./scripts/esm-alias-register.mjs ./scripts/verify-multi-photo-pdf.mjs
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib'

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
  // Synchronous count via pdf-lib after load — caller awaits load.
  return bytes
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

  const found = await sql`
    SELECT i.id, i.inspector_name, i.location_label, i.block_id, i.submitted_at, i.status,
           i.template_name, i.work_type, b.name AS block_name
    FROM inspections i
    LEFT JOIN blocks b ON b.id = i.block_id
    WHERE (
      i.inspector_name ILIKE '%Paul%Brazil%'
      OR i.inspector_name ILIKE '%Brazil%'
    )
    AND (
      COALESCE(i.location_label, '') ILIKE '%Canterbury%'
      OR COALESCE(b.name, '') ILIKE '%Canterbury%'
      OR COALESCE(i.title, '') ILIKE '%Canterbury%'
    )
    ORDER BY i.submitted_at DESC NULLS LAST
    LIMIT 10
  `

  if (!found.rows.length) {
    const broader = await sql`
      SELECT i.id, i.inspector_name, i.location_label, i.submitted_at, b.name AS block_name
      FROM inspections i
      LEFT JOIN blocks b ON b.id = i.block_id
      WHERE COALESCE(i.location_label, '') ILIKE '%Canterbury%'
         OR COALESCE(b.name, '') ILIKE '%Canterbury%'
      ORDER BY i.submitted_at DESC NULLS LAST
      LIMIT 20
    `
    console.log('No Paul Brazil + Canterbury match. Canterbury-related rows:')
    console.log(JSON.stringify(broader.rows, null, 2))
    process.exit(1)
  }

  // Prefer exact 18-29 / 18–29 Canterbury match when present; else 18-20B; else latest Brazil+Canterbury.
  const preferred =
    found.rows.find((r) => /18[\s–-]*29/i.test(String(r.block_name || r.location_label || ''))) ||
    found.rows.find((r) => /18[\s–-]*20/i.test(String(r.block_name || r.location_label || ''))) ||
    found.rows[0]

  console.log('Matched inspections:')
  console.log(JSON.stringify(found.rows, null, 2))
  const inspection = preferred
  const inspectionId = inspection.id
  console.log('\nUsing inspection:', inspectionId, inspection.block_name || inspection.location_label)

  const photos = await sql`
    SELECT question_id, blob_url, filename
    FROM inspection_photos
    WHERE inspection_id = ${inspectionId}
    ORDER BY question_id, filename
  `

  const byQuestion = new Map()
  for (const row of photos.rows) {
    const qid = row.question_id || '(unlinked)'
    if (!byQuestion.has(qid)) byQuestion.set(qid, [])
    byQuestion.get(qid).push(row.blob_url)
  }

  console.log('\nStored inspection_photos by question:')
  let storedTotal = 0
  for (const [qid, urls] of byQuestion.entries()) {
    storedTotal += urls.length
    console.log(`  ${qid}: ${urls.length} photo(s)`)
  }
  console.log('Total rows in inspection_photos:', storedTotal)

  const inspRes = await sql`SELECT * FROM inspections WHERE id = ${inspectionId} LIMIT 1`
  const inspectionRow = inspRes.rows[0]
  if (!inspectionRow) {
    console.error('Inspection row missing')
    process.exit(1)
  }

  const { pdfData } = await buildFullInspectionReportPdfPayload(sql, inspectionId, inspectionRow)
  const payloadByQ = new Map()
  for (const p of pdfData.photos || []) {
    const qid = p.linkedQuestionId || '(unlinked)'
    if (!payloadByQ.has(qid)) payloadByQ.set(qid, [])
    payloadByQ.get(qid).push(p.url)
  }
  console.log('\nPDF payload photos by question:')
  let payloadTotal = 0
  for (const [qid, urls] of payloadByQ.entries()) {
    payloadTotal += urls.length
    console.log(`  ${qid}: ${urls.length} photo(s)`)
  }
  console.log('Payload photo count:', payloadTotal)

  const multi = [...payloadByQ.entries()].filter(([, u]) => u.length > 1)
  console.log('Questions with multiple photos:', multi.length)
  for (const [qid, urls] of multi) {
    console.log(`  ${qid}: ${urls.length}`)
  }

  const actionPhotoCount = (pdfData.actions || []).reduce(
    (sum, a) => sum + (Array.isArray(a.photoUrls) ? a.photoUrls.filter(Boolean).length : 0),
    0
  )
  console.log('Action photo URLs in payload:', actionPhotoCount)

  console.log('\nGenerating PDF…')
  const bytes = await buildInspectionReportPdf(pdfData)
  const outDir = join(root, 'tmp')
  mkdirSync(outDir, { recursive: true })
  const outPath = join(outDir, `verify-multi-photo-${inspectionId}.pdf`)
  writeFileSync(outPath, Buffer.from(bytes))
  console.log('Wrote', outPath, `(${bytes.length} bytes)`)

  const pdfDoc = await PDFDocument.load(bytes)
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

  // Logo is typically one embedded image.
  const inspectionPhotosRendered = Math.max(0, embeddedImages - 1)
  console.log('\nEmbedded Image XObjects in PDF (includes logo if present):', embeddedImages)
  console.log('Expected inspection photos in payload:', payloadTotal)
  console.log('Expected action photos in payload:', actionPhotoCount)
  console.log('Inspection+action photos likely rendered (embedded − 1 logo):', inspectionPhotosRendered)

  const expectedDrawn = payloadTotal + actionPhotoCount
  if (inspectionPhotosRendered < expectedDrawn) {
    console.warn(
      `WARNING: rendered ${inspectionPhotosRendered} < expected ${expectedDrawn} (some embeds may have failed to download)`
    )
  } else {
    console.log(`OK: rendered at least ${expectedDrawn} inspection/action photos`)
  }

  try {
    const result = await ensureFullInspectionPdf(sql, { inspectionId, forceRegenerate: true })
    console.log('\nensureFullInspectionPdf:', result)
  } catch (e) {
    console.warn('Could not persist regenerated PDF (local file still written):', e.message)
  }

  console.log('\nSUMMARY')
  console.log(JSON.stringify({
    inspectionId,
    inspector: inspection.inspector_name,
    location: inspection.block_name || inspection.location_label,
    storedPhotoRows: storedTotal,
    payloadPhotos: payloadTotal,
    actionPhotos: actionPhotoCount,
    embeddedImagesIncludingLogo: embeddedImages,
    photosRenderedExcludingLogo: inspectionPhotosRendered,
    localPdf: outPath,
  }, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
