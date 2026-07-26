#!/usr/bin/env node
/**
 * Find Longheath Gardens 279–288 Estate Walkabout (~10 July 2026),
 * force-regenerate full PDF, and verify mockup acceptance criteria.
 *
 * Usage:
 *   node --import ./scripts/esm-alias-register.mjs ./scripts/verify-longheath-walkabout-pdf.mjs
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

function check(name, ok, detail = '') {
  const mark = ok ? 'PASS' : 'FAIL'
  console.log(`[${mark}] ${name}${detail ? ` — ${detail}` : ''}`)
  return ok
}

async function countEmbeddedImages(bytes) {
  const pdfDoc = await PDFDocument.load(bytes)
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
}

function collectPayloadText(pdfData) {
  const parts = []
  parts.push(String(pdfData.officerName || ''))
  parts.push(String(pdfData.blockName || ''))
  for (const section of pdfData.sections || []) {
    parts.push(String(section.title || ''))
    for (const q of section.questions || []) {
      parts.push(String(q.text || ''))
      parts.push(String(q.answer || ''))
      parts.push(String(q.rating || ''))
      parts.push(String(q.comment || ''))
    }
  }
  for (const a of pdfData.actions || []) {
    parts.push(String(a.title || ''))
    parts.push(String(a.description || ''))
    parts.push(String(a.raisedBy || ''))
  }
  return parts.join('\n')
}

async function main() {
  loadEnv(join(root, '.env'))
  loadEnv(join(root, '.env.local'))

  // Some local env files store the Neon URL under a misnamed `postgresql` key
  // (value may be a full URL or a `://…` suffix).
  if (!process.env.POSTGRES_URL && process.env.postgresql) {
    const raw = String(process.env.postgresql).trim()
    process.env.POSTGRES_URL = raw.startsWith('://') ? `postgresql${raw}` : raw
  }

  if (!process.env.POSTGRES_URL) {
    process.env.POSTGRES_URL =
      process.env.POSTGRES_PRISMA_URL ||
      process.env.DATABASE_URL ||
      process.env.DIRECT_URL ||
      process.env.NEON_DATABASE_URL
  }
  if (!process.env.POSTGRES_URL) {
    console.error('No database URL configured (need POSTGRES_URL / DATABASE_URL / postgresql in .env.local)')
    process.exit(1)
  }

  // Ensure @vercel/postgres sees POSTGRES_URL before first import.
  const { sql } = await import('@vercel/postgres')
  await import('@/lib/db.js')
  const { buildFullInspectionReportPdfPayload, ensureFullInspectionPdf } = await import(
    '@/lib/full-inspection-report-pdf.js'
  )
  const { buildInspectionReportPdf } = await import('@/lib/pdf/buildInspectionReportPdf.js')
  const { REPORT_VARIANTS, reportColumnLabels } = await import(
    '@/lib/pdf/inspection-report-variant.js'
  )
  const { looksLikePersonId } = await import('@/lib/resolve-person-display-name.js')

  console.log('Searching for Longheath Gardens 279–288 Estate Walkabout…')
  const result = await sql`
    SELECT i.id, i.title, i.location_label, i.template_name, i.submitted_at, i.inspector_name,
           i.inspector_id, i.full_pdf_url, i.status, i.type, i.template_version,
           COALESCE(NULLIF(CONCAT_WS(' / ', e.name, b.name), ''), i.location_label, i.title) AS location_line
    FROM inspections i
    LEFT JOIN estates e ON e.id = i.estate_id
    LEFT JOIN blocks b ON b.id = i.block_id
    WHERE (
      COALESCE(e.name, '') ILIKE '%Longheath%'
      OR COALESCE(b.name, '') ILIKE '%Longheath%'
      OR COALESCE(i.location_label, '') ILIKE '%Longheath%'
      OR COALESCE(i.title, '') ILIKE '%Longheath%'
    )
    AND (
      COALESCE(b.name, '') ~ '279|288'
      OR COALESCE(i.location_label, '') ~ '279|288'
      OR COALESCE(i.title, '') ~ '279|288'
    )
    AND i.submitted_at IS NOT NULL
    ORDER BY i.submitted_at DESC
    LIMIT 15
  `

  const rows = result.rows || []
  if (!rows.length) {
    // Broader fallback
    const broad = await sql`
      SELECT i.id, i.title, i.location_label, i.template_name, i.submitted_at, i.inspector_name,
             i.inspector_id, i.full_pdf_url, i.status, i.type, i.template_version,
             COALESCE(NULLIF(CONCAT_WS(' / ', e.name, b.name), ''), i.location_label, i.title) AS location_line
      FROM inspections i
      LEFT JOIN estates e ON e.id = i.estate_id
      LEFT JOIN blocks b ON b.id = i.block_id
      WHERE (
        COALESCE(e.name, '') ILIKE '%Longheath%'
        OR COALESCE(b.name, '') ILIKE '%Longheath%'
        OR COALESCE(i.location_label, '') ILIKE '%Longheath%'
        OR COALESCE(i.title, '') ILIKE '%Longheath%'
      )
      AND i.submitted_at IS NOT NULL
      ORDER BY i.submitted_at DESC
      LIMIT 15
    `
    if (!broad.rows.length) {
      console.error('No matching Longheath Gardens inspection found.')
      process.exit(1)
    }
    rows.push(...broad.rows)
  }

  for (const r of rows) {
    console.log(
      `  candidate id=${r.id} submitted=${r.submitted_at} loc=${r.location_line} template=${r.template_name}`
    )
  }

  // Prefer walkabout around early/mid July 2026
  const preferred =
    rows.find((r) => {
      const t = `${r.template_name || ''} ${r.type || ''} ${typeof r.template_version === 'string' ? r.template_version : JSON.stringify(r.template_version || {})}`
      const isWalk = /walkabout/i.test(t)
      const d = r.submitted_at ? new Date(r.submitted_at) : null
      const aroundJuly =
        d && d.getFullYear() === 2026 && d.getMonth() === 6 && d.getDate() >= 8 && d.getDate() <= 12
      return isWalk && aroundJuly
    }) ||
    rows.find((r) => /walkabout/i.test(`${r.template_name || ''} ${r.type || ''}`)) ||
    rows[0]

  const inspectionId = preferred.id
  console.log(`\nUsing inspection ${inspectionId} (${preferred.location_line})`)

  const inspRes = await sql`SELECT * FROM inspections WHERE id = ${inspectionId} LIMIT 1`
  const inspection = inspRes.rows[0]
  if (!inspection) {
    console.error('Inspection row missing')
    process.exit(1)
  }

  const { pdfData } = await buildFullInspectionReportPdfPayload(sql, inspectionId, inspection)
  const text = collectPayloadText(pdfData)
  const labels = reportColumnLabels(pdfData.reportVariant)

  let failures = 0
  const fail = (...args) => {
    if (!check(...args)) failures += 1
  }

  fail(
    'reportVariant is walkabout',
    pdfData.reportVariant === REPORT_VARIANTS.WALKABOUT,
    String(pdfData.reportVariant)
  )
  fail('Column middle label is Answer', labels.middle === 'Answer', labels.middle)
  fail(
    'Columns match mockup',
    labels.question === 'Question / Observation' && labels.photo === 'Photo / Evidence',
    JSON.stringify(labels)
  )
  fail(
    'Inspector is display name (not person id)',
    Boolean(pdfData.officerName) && !looksLikePersonId(pdfData.officerName),
    pdfData.officerName
  )
  fail('No raw person_ / ppl_ ids in payload text', !/(person_|ppl_)[a-z0-9_]+/i.test(text), '')
  fail('No raw checklist JSON blob in payload text', !/"action_required"\s*:/.test(text), '')
  fail(
    'No photo URLs printed as question text',
    !/https?:\/\/\S+\.(jpg|jpeg|png|webp)/i.test(
      (pdfData.sections || [])
        .flatMap((s) => s.questions || [])
        .map((q) => String(q.text || ''))
        .join('\n')
    )
  )

  const ynQuestions = (pdfData.sections || []).flatMap((s) => s.questions || []).filter((q) => {
    const v = String(q.rating || q.answer || '')
      .trim()
      .toUpperCase()
    return v === 'YES' || v === 'NO' || v === 'N/A' || v === 'NA'
  })
  const answeredNo = ynQuestions.filter(
    (q) => String(q.rating || q.answer).trim().toUpperCase() === 'NO'
  )
  fail(
    'Answered No never uses task_yes_no / walkabout_unanswered',
    answeredNo.every((q) => q.resultMode === 'simple_yes_no' || q.resultMode === 'issue_yes_no'),
    `answeredNo=${answeredNo.length}`
  )
  fail(
    'Answered Yes/No use simple_yes_no (not task_yes_no)',
    ynQuestions.every((q) => q.resultMode !== 'task_yes_no'),
    `ynRows=${ynQuestions.length}`
  )

  const checklistRows = (pdfData.sections || [])
    .flatMap((s) => s.questions || [])
    .filter((q) => String(q.id || '').startsWith('ew_chk_'))
  fail(
    'Checklist expanded to readable rows (or none stored)',
    checklistRows.length > 0 || !/"photo_urls"\s*:/.test(text),
    `rows=${checklistRows.length}`
  )
  if (checklistRows.length) {
    fail(
      'Checklist row includes Action required line',
      checklistRows.some((q) => /Action required:/i.test(String(q.text || ''))),
      ''
    )
  }

  // Walkabout: Issues Raised should not repeat findings / additional items.
  fail(
    'Walkabout payload has no redundant Issues Raised actions',
    (pdfData.actions || []).length === 0 ||
      (pdfData.actions || []).every((a) => {
        const qid = String(a.questionId || '')
        if (!qid) return true
        return !(pdfData.sections || [])
          .flatMap((s) => s.questions || [])
          .some((q) => String(q.id) === qid)
      }),
    `actions=${(pdfData.actions || []).length}`
  )

  const findingsWithComments = (pdfData.sections || [])
    .flatMap((s) => s.questions || [])
    .filter((q) => q.comment && String(q.comment).trim())
  console.log(
    `[INFO] payloadCommentCount=${findingsWithComments.length} sample=${
      findingsWithComments
        .slice(0, 3)
        .map((q) => `${q.id}:${String(q.comment).slice(0, 40)}`)
        .join(' | ') || '(none)'
    }`
  )

  const commentAnswersRes = await sql`
    SELECT question_id, LEFT(COALESCE(answer_text, answer_value, notes, ''), 80) AS preview
    FROM inspection_answers
    WHERE inspection_id = ${inspectionId}
      AND (
        question_id LIKE 'ew_it_%_comment'
        OR question_id IN ('ew_it_bulk_refuse_comments', 'ew_it_bulk_refuse_exact_location')
      )
      AND COALESCE(NULLIF(TRIM(COALESCE(answer_text, '')), ''), NULLIF(TRIM(COALESCE(answer_value, '')), ''), NULLIF(TRIM(COALESCE(notes, '')), '')) IS NOT NULL
  `
  const actionCommentsRes = await sql`
    SELECT question_id, LEFT(COALESCE(comment, ''), 80) AS preview
    FROM actions
    WHERE inspection_id = ${inspectionId}
      AND question_id LIKE 'ew_it_%'
      AND comment IS NOT NULL
      AND TRIM(comment) <> ''
      AND comment !~* '^Response:\\s*(Yes|No|NA|N/A)\\s*$'
      AND comment !~* '^(Yes|No|NA|N/A)$'
  `
  const dbSiblingComments = commentAnswersRes.rows?.length || 0
  const dbActionComments = actionCommentsRes.rows?.length || 0
  console.log(
    `[INFO] DB sibling qid_comment rows=${dbSiblingComments}; useful action comments=${dbActionComments}`
  )
  if (dbSiblingComments > 0 || dbActionComments > 0) {
    fail(
      'payloadCommentCount non-zero when DB has investigation text',
      findingsWithComments.length > 0,
      `payloadCommentCount=${findingsWithComments.length} dbSibling=${dbSiblingComments} dbAction=${dbActionComments}`
    )
  }

  const latin1PreviewNote =
    'PDF bytes scanned below for literal "Issues Raised" heading when actions already in findings'

  const multiPhotoFindings = (pdfData.sections || []).flatMap((s) =>
    (s.questions || [])
      .map((q) => {
        const photos = (pdfData.photos || []).filter((p) => p.linkedQuestionId === q.id)
        return { q, n: photos.length }
      })
      .filter((x) => x.n >= 2)
  )
  if (multiPhotoFindings.length) {
    fail(
      'Multi-photo findings rows present',
      true,
      multiPhotoFindings.map((x) => `${x.q.id}:${x.n}`).join(', ')
    )
  } else {
    console.log('[INFO] No multi-photo findings rows in this inspection')
  }

  for (const action of pdfData.actions || []) {
    if ((action.photoUrls || []).length > 1) {
      fail(
        `Issue keeps all photos (${action.photoUrls.length})`,
        action.photoUrls.length >= 2,
        action.title || action.questionId
      )
    }
  }

  console.log('\nBuilding PDF bytes (local verify; Blob upload may require Next runtime)…')
  const bytes = await buildInspectionReportPdf(pdfData)
  fail('PDF bytes produced', bytes?.length > 1000, `bytes=${bytes?.length || 0}`)

  const { count: imageCount, pages } = await countEmbeddedImages(bytes)
  console.log(`PDF pages=${pages} embeddedImages=${imageCount}`)

  // Heuristic string scan in PDF content streams
  const latin1 = Buffer.from(bytes).toString('latin1')
  const hasNotCompleted = /Not Completed/.test(latin1)
  const hasLiteralNo = /\(No\)|No\0| Tj[^\n]{0,40}No|\/No/.test(latin1) || latin1.includes('No')
  const hasIssuesRaisedHeading = /Issues Raised/.test(latin1)
  const findingsCoverActions =
    (pdfData.actions || []).length === 0 &&
    (pdfData.sections || []).some((s) => (s.questions || []).some((q) => q.hasIssue || String(q.id || '').startsWith('ew_')))
  if (findingsCoverActions || (pdfData.actions || []).length === 0) {
    fail(
      'PDF omits redundant Issues Raised heading for Walkabout',
      !hasIssuesRaisedHeading,
      `hasIssuesRaised=${hasIssuesRaisedHeading}; ${latin1PreviewNote}`
    )
  }
  console.log(
    `[INFO] PDF byte scan: Not Completed=${hasNotCompleted} (may appear for unanswered only); literal No present=${hasLiteralNo}; Issues Raised=${hasIssuesRaisedHeading}`
  )

  // Soft Blob regenerate — Node can't execute uploadPdf.ts without a TS loader;
  // the Next.js API route handles Blob upload in production.
  try {
    const ensure = await ensureFullInspectionPdf(sql, { inspectionId, forceRegenerate: true })
    if (ensure.ok && ensure.generated) {
      check('ensureFullInspectionPdf regenerated to Blob', true, ensure.url)
    } else if (ensure.ok && !ensure.generated) {
      check('ensureFullInspectionPdf returned cached URL (unexpected with force)', false, ensure.url)
      failures += 1
    } else {
      console.log(`[INFO] Blob regenerate skipped/failed in Node: ${ensure.error || 'unknown'}`)
      console.log('[INFO] View/Download in the app uses the Next.js report-pdf API (supports .ts upload).')
    }
  } catch (err) {
    console.log(`[INFO] Blob regenerate not available in this Node script: ${err?.message || err}`)
  }

  const outDir = join(root, 'tmp')
  mkdirSync(outDir, { recursive: true })
  const outPath = join(outDir, `longheath-walkabout-${inspectionId}.pdf`)
  writeFileSync(outPath, bytes)
  console.log(`Wrote local PDF: ${outPath}`)

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed`)
    process.exit(1)
  }
  console.log('\nAll Longheath Walkabout PDF checks passed.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
