/**
 * Creates a **new** Airtable template "Estate Inspection v2" with sections and questions
 * from `lib/estate-inspection-v2-seed-spec.js`. Does not edit the legacy Estate Inspection template.
 *
 * Prerequisites: AIRTABLE_BASE_ID, AIRTABLE_API_TOKEN (or AIRTABLE_API_KEY).
 * Optional: AIRTABLE_TEMPLATES_TABLE, AIRTABLE_SECTIONS_TABLE, AIRTABLE_QUESTIONS_TABLE (defaults match lib/airtable-client.js).
 *
 * Usage:
 *   node scripts/create-estate-inspection-v2-airtable.mjs           # create rows
 *   node scripts/create-estate-inspection-v2-airtable.mjs --dry-run # print only
 *
 * After creation: set the legacy template inactive in Airtable if you want only v2 offered;
 * optionally set ESTATE_INSPECTION_V2_TEMPLATE_ID to the new record id for env-based detection.
 */

import {
  ESTATE_INSPECTION_V2_TEMPLATE,
  ESTATE_INSPECTION_V2_SECTIONS,
} from '../lib/estate-inspection-v2-seed-spec.js'

const AIRTABLE_API_URL = 'https://api.airtable.com/v0'

function getEnv() {
  const baseId = process.env.AIRTABLE_BASE_ID?.trim() || ''
  const apiKey =
    process.env.AIRTABLE_API_TOKEN?.trim() || process.env.AIRTABLE_API_KEY?.trim() || ''
  const templatesTable = process.env.AIRTABLE_TEMPLATES_TABLE?.trim() || 'Templates'
  const sectionsTable = process.env.AIRTABLE_SECTIONS_TABLE?.trim() || 'Template Sections'
  const questionsTable = process.env.AIRTABLE_QUESTIONS_TABLE?.trim() || 'Template Questions'
  return { baseId, apiKey, templatesTable, sectionsTable, questionsTable }
}

async function createRecord(tableName, fields) {
  const { baseId, apiKey } = getEnv()
  const url = `${AIRTABLE_API_URL}/${baseId}/${encodeURIComponent(tableName)}`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields }),
    cache: 'no-store',
  })
  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Airtable ${tableName}: ${response.status} ${response.statusText} — ${errText}`)
  }
  const data = await response.json()
  return data.id
}

async function listTemplatesByFormula(formula) {
  const { baseId, apiKey, templatesTable } = getEnv()
  const qs = new URLSearchParams({ filterByFormula: formula, maxRecords: '5' })
  const url = `${AIRTABLE_API_URL}/${baseId}/${encodeURIComponent(templatesTable)}?${qs}`
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: 'no-store',
  })
  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Airtable list templates: ${response.status} — ${errText}`)
  }
  const data = await response.json()
  return data.records || []
}

function templateFieldsForCreate() {
  const t = { ...ESTATE_INSPECTION_V2_TEMPLATE }
  const out = {}
  if (t.Name != null) out.Name = t.Name
  if (t['Template Key'] != null) out['Template Key'] = t['Template Key']
  if (t['Template Type'] != null) out['Template Type'] = t['Template Type']
  /** Most bases use one of these; remove keys your base rejects if Airtable returns UNKNOWN_FIELD_NAME. */
  out['Is Active'] = true
  return out
}

function sectionFields(title, order, templateRecordId) {
  return {
    'Section Title': title,
    'Section Order': order,
    Template: [templateRecordId],
  }
}

function questionFields({ questionText, questionType, questionOrder, sectionRecordId, extra }) {
  const fields = {
    'Question Text': questionText,
    'Question Type': questionType,
    'Question Order': questionOrder,
    Section: [sectionRecordId],
  }
  if (extra && typeof extra === 'object') {
    for (const [k, v] of Object.entries(extra)) {
      if (v !== undefined) fields[k] = v
    }
  }
  return fields
}

const dryRun = process.argv.includes('--dry-run')

async function main() {
  const env = getEnv()
  if (!env.baseId || !env.apiKey) {
    console.error('Missing AIRTABLE_BASE_ID or AIRTABLE_API_TOKEN / AIRTABLE_API_KEY.')
    process.exit(1)
  }

  const key = ESTATE_INSPECTION_V2_TEMPLATE['Template Key']
  const existing = await listTemplatesByFormula(
    `{Template Key} = "${String(key).replace(/"/g, '\\"')}"`
  )
  if (existing.length > 0 && !process.argv.includes('--force')) {
    console.error(
      `A template with Template Key "${key}" already exists (rec ${existing[0].id}). Use --force to create another copy anyway.`
    )
    process.exit(1)
  }

  console.log(dryRun ? '[dry-run] Would create template, sections, and questions.' : 'Creating records…')

  let templateId = 'rec_DRY_RUN'
  if (!dryRun) {
    templateId = await createRecord(env.templatesTable, templateFieldsForCreate())
    console.log('Template:', templateId)
  } else {
    console.log('Template fields:', JSON.stringify(templateFieldsForCreate(), null, 2))
  }

  for (const sec of ESTATE_INSPECTION_V2_SECTIONS) {
    const sectionPayload = sectionFields(sec.sectionTitle, sec.sectionOrder, templateId)
    let sectionId = 'rec_SECTION_DRY'
    if (!dryRun) {
      sectionId = await createRecord(env.sectionsTable, sectionPayload)
      console.log('  Section', sec.sectionOrder, sec.sectionTitle, '→', sectionId)
    } else {
      console.log('  [section]', sec.sectionTitle, JSON.stringify(sectionPayload))
    }

    for (const q of sec.questions) {
      const qPayload = questionFields({
        questionText: q.questionText,
        questionType: q.questionType,
        questionOrder: q.questionOrder,
        sectionRecordId: sectionId,
        extra: q.extra,
      })
      if (!dryRun) {
        const qid = await createRecord(env.questionsTable, qPayload)
        console.log('    Q', q.questionOrder, q.questionText.slice(0, 48), '…', qid)
      } else {
        console.log('    [question]', JSON.stringify(qPayload))
      }
    }
  }

  if (!dryRun) {
    console.log('\nDone. New template record id:', templateId)
    console.log('Optional: set ESTATE_INSPECTION_V2_TEMPLATE_ID=' + templateId + ' in Vercel env.')
    console.log('Deactivate the old "Estate Inspection" template in Airtable (Is Active / Active) if only v2 should appear.')
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
