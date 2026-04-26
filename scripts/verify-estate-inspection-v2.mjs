const AIRTABLE_API_URL = 'https://api.airtable.com/v0'

const EXPECTED = [
  'Please confirm the overall rating for cleanliness of ledges and window sills',
  'Please confirm the overall rating for cleanliness of light fittings and working condition',
  'Please confirm the overall rating for sweeping and washing of stairs, landings, entrance halls and lobbies, and washing down of tiles and painted walls.',
  'Please confirm the overall rating for cobwebs',
  'Please confirm the overall rating for entrance halls and lobbies.',
  'Please confirm the overall rating for handrails, ledges and banister rails',
  'Please confirm the overall rating for cleanliness of walls in communal areas',
]

function env() {
  return {
    baseId: process.env.AIRTABLE_BASE_ID?.trim() || '',
    key: process.env.AIRTABLE_API_TOKEN?.trim() || process.env.AIRTABLE_API_KEY?.trim() || '',
    templates: process.env.AIRTABLE_TEMPLATES_TABLE || 'Templates',
    sections: process.env.AIRTABLE_SECTIONS_TABLE || 'Template Sections',
    questions: process.env.AIRTABLE_QUESTIONS_TABLE || 'Template Questions',
  }
}

async function list(tableName) {
  const e = env()
  const out = []
  let offset = ''
  do {
    const qs = new URLSearchParams()
    if (offset) qs.set('offset', offset)
    const res = await fetch(`${AIRTABLE_API_URL}/${e.baseId}/${encodeURIComponent(tableName)}?${qs}`, {
      headers: { Authorization: `Bearer ${e.key}` },
      cache: 'no-store',
    })
    if (!res.ok) throw new Error(`${tableName}: ${res.status} ${await res.text()}`)
    const body = await res.json()
    out.push(...(body.records || []).map((r) => ({ id: r.id, ...r.fields })))
    offset = body.offset || ''
  } while (offset)
  return out
}

function nameOfTemplate(t) {
  return String(t['Template Name'] ?? t.Name ?? t.name ?? '').trim()
}

function templateKey(t) {
  return String(t['Template Key'] ?? t.template_key ?? '').toLowerCase().trim()
}

function active(t) {
  if (t.is_active !== undefined) return !!t.is_active
  if (t['Is Active'] !== undefined) return !!t['Is Active']
  if (t.Active !== undefined) return !!t.Active
  return true
}

function linkedIds(v) {
  if (v == null) return []
  return (Array.isArray(v) ? v : [v]).map((x) => String(x?.id ?? x).trim()).filter(Boolean)
}

function normalize(s) {
  return String(s || '').toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

const e = env()
if (!e.baseId || !e.key) {
  console.error('Missing AIRTABLE_BASE_ID and AIRTABLE_API_TOKEN / AIRTABLE_API_KEY.')
  process.exit(1)
}

const [templates, sections, questions] = await Promise.all([list(e.templates), list(e.sections), list(e.questions)])
const v2 = templates.find((t) => {
  const n = nameOfTemplate(t).toLowerCase()
  const k = templateKey(t)
  return active(t) && (n.includes('estate inspection v2') || k === 'estate_inspection_v2' || k === 'estate_inspection_form_v2')
})

if (!v2) {
  console.error('Estate Inspection v2 not found as an active Airtable template.')
  process.exit(1)
}

const v2Sections = sections.filter((s) => linkedIds(s.Template).includes(v2.id))
const section = v2Sections.find((s) => {
  const title = String(s['Section Title'] ?? s.section_title ?? s.Name ?? s.title ?? '').trim()
  const order = Number(s['Section Order'] ?? s.Order ?? s.sort_order ?? 0)
  return normalize(title) === 'internal cleaning' || order === 1
})

if (!section) {
  console.error(`Template found (${v2.id}) but Section 1 / Internal Cleaning was not found.`)
  process.exit(1)
}

const sectionQuestions = questions
  .filter((q) => linkedIds(q.Section).includes(section.id))
  .sort((a, b) => (Number(a['Question Order'] ?? a.Order ?? 0) || 0) - (Number(b['Question Order'] ?? b.Order ?? 0) || 0))

console.log(`Template: ${nameOfTemplate(v2)} (${v2.id})`)
console.log(`Section 1: ${section['Section Title'] ?? section.Name ?? section.id} (${section.id})`)
console.log(`Airtable question count: ${sectionQuestions.length}`)

for (const [idx, text] of EXPECTED.entries()) {
  const q = sectionQuestions[idx]
  const actual = String(q?.['Question Text'] ?? q?.question_text ?? q?.label ?? '').trim()
  const type = String(q?.['Question Type'] ?? q?.question_type ?? '').trim()
  const photo =
    q?.['Include Photo'] === true ||
    q?.['Include Photo?'] === true ||
    q?.include_photo === true ||
    String(type).toLowerCase().includes('photo')
  const status = normalize(actual) === normalize(text) ? 'OK' : 'MISMATCH'
  console.log(`${idx + 1}. ${status} | ${actual || '(missing)'} | type=${type || '(blank)'} | photo=${photo ? 'yes' : 'no'}`)
}
