#!/usr/bin/env node
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

const insp = (await sql`SELECT * FROM inspections WHERE id = ${ID} LIMIT 1`).rows[0]
const { pdfData } = await buildFullInspectionReportPdfPayload(sql, ID, insp)
const qs = (pdfData.sections || []).flatMap((s) => s.questions || [])

const interesting = qs.filter(
  (q) =>
    /present|responsible|repairs officer|staff|housing/i.test(String(q.text || '')) ||
    /present|responsible|repairs/i.test(String(q.id || ''))
)
console.log('--- staff / person related ---')
for (const q of interesting) {
  console.log({
    id: q.id,
    text: String(q.text).slice(0, 90),
    answer: q.answer,
    rating: q.rating,
    mode: q.resultMode,
  })
}

const nos = qs
  .filter((q) => String(q.rating || q.answer || '').toUpperCase() === 'NO')
  .slice(0, 10)
console.log('--- sample answered No ---')
for (const q of nos) {
  console.log({ text: String(q.text).slice(0, 70), mode: q.resultMode, rating: q.rating })
}

console.log('officer:', pdfData.officerName)
