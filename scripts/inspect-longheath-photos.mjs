#!/usr/bin/env node
/**
 * Inspect Longheath Walkabout photo / checklist storage.
 * Usage: node --import ./scripts/esm-alias-register.mjs ./scripts/inspect-longheath-photos.mjs
 */
import { existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const ID = 'f6e0fa1f-eb75-4612-869a-de4e415850fe'

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

loadEnv(join(root, '.env.local'))
if (!process.env.POSTGRES_URL && process.env.postgresql) {
  const raw = String(process.env.postgresql).trim()
  process.env.POSTGRES_URL = raw.startsWith('://') ? `postgresql${raw}` : raw
}

const { sql } = await import('@vercel/postgres')
const { buildFullInspectionReportPdfPayload } = await import('@/lib/full-inspection-report-pdf.js')

const answers = await sql`
  SELECT question_id,
         length(coalesce(answer_value, answer_text, '')) AS len,
         left(coalesce(answer_value, answer_text, ''), 200) AS sample
  FROM inspection_answers
  WHERE inspection_id = ${ID}
    AND (question_id = 'ew_checklist_json' OR coalesce(answer_value, answer_text, '') LIKE '[%')
`
console.log('--- checklist answers ---')
for (const row of answers.rows) {
  console.log(row.question_id, 'len=', row.len)
  try {
    const parsed = JSON.parse(
      (
        await sql`
          SELECT coalesce(answer_value, answer_text, '') AS raw
          FROM inspection_answers
          WHERE inspection_id = ${ID} AND question_id = ${row.question_id}
          LIMIT 1
        `
      ).rows[0].raw
    )
    if (Array.isArray(parsed)) {
      parsed.forEach((item, i) => {
        const urls = Array.isArray(item.photo_urls) ? item.photo_urls : []
        console.log(
          `  item[${i}] action_required=${item.action_required} photos=${urls.length} desc=${String(item.description || '').slice(0, 60)}`
        )
      })
    }
  } catch (e) {
    console.log('  parse fail', e.message)
  }
}

const photos = await sql`
  SELECT question_id, count(*)::int AS n
  FROM inspection_photos
  WHERE inspection_id = ${ID}
  GROUP BY question_id
`
console.log('--- inspection_photos ---', photos.rows)

const actions = await sql`
  SELECT id, question_id, left(coalesce(title, ''), 80) AS title, photo_urls
  FROM actions
  WHERE inspection_id = ${ID}
`
console.log('--- actions ---')
for (const a of actions.rows) {
  let urls = []
  try {
    urls = typeof a.photo_urls === 'string' ? JSON.parse(a.photo_urls) : a.photo_urls || []
  } catch {
    urls = []
  }
  console.log(`  ${a.question_id} photos=${Array.isArray(urls) ? urls.length : 0} ${a.title}`)
}

const insp = (await sql`SELECT * FROM inspections WHERE id = ${ID} LIMIT 1`).rows[0]
const { pdfData } = await buildFullInspectionReportPdfPayload(sql, ID, insp)
console.log('--- payload ---')
console.log('photos', (pdfData.photos || []).length)
console.log(
  'checklist rows',
  (pdfData.sections || [])
    .flatMap((s) => s.questions || [])
    .filter((q) => String(q.id || '').startsWith('ew_chk_'))
    .map((q) => ({
      id: q.id,
      rating: q.rating,
      textHead: String(q.text || '').split('\n')[0],
      photoCount: (pdfData.photos || []).filter((p) => p.linkedQuestionId === q.id).length,
    }))
)
console.log(
  'actions with photos',
  (pdfData.actions || []).map((a) => ({
    title: a.title,
    n: (a.photoUrls || []).length,
  }))
)

const yn = (pdfData.sections || [])
  .flatMap((s) => s.questions || [])
  .filter((q) => /staff present|repairs officer present/i.test(String(q.text || '')))
console.log('staff-present style rows', yn.map((q) => ({ text: q.text, answer: q.answer || q.rating, mode: q.resultMode })))
