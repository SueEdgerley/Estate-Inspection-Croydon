import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { getAppAdminAccess } from '@/lib/app-admin-access'
import {
  getAirtableProductionDiagnostics,
  getLastTemplatesNestedFetchMeta,
  getTemplatesNested,
} from '@/lib/airtable-client'
import { ensureDatabase, getPgUrl } from '@/lib/db'
import { applyEsmInspectionFormPatch, isEsmInspectionFormTemplate } from '@/lib/esm-inspection-form'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value))
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`
  const keys = Object.keys(value).sort()
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
}

function hashSnapshot(snapshot) {
  return createHash('sha256').update(stableStringify(snapshot)).digest('hex')
}

function isEstateInspectionCandidate(template) {
  if (isEsmInspectionFormTemplate(template)) return true
  const key = String(template?.template_key ?? '').toLowerCase().trim()
  const name = String(template?.name ?? '').toLowerCase().trim()
  if (key.includes('esm_inspection') || key.includes('estate_inspection')) return true
  if (!name.includes('estate') || !name.includes('inspection')) return false
  return !name.includes('walkabout') && !name.includes('neighbourhood') && !name.includes('caretaker')
}

function summarizeTemplate(template) {
  const sections = Array.isArray(template?.sections) ? template.sections : []
  const sectionTitles = sections.map((section) => section?.title || section?.name || '')
  const questionCounts = sections.map((section) =>
    Array.isArray(section?.questions) ? section.questions.length : 0
  )
  return {
    id: template?.id ?? null,
    name: template?.name ?? null,
    template_key: template?.template_key ?? '',
    section_count: sections.length,
    question_count: questionCounts.reduce((sum, count) => sum + count, 0),
    includes_storage_areas: sectionTitles.some((title) =>
      String(title || '').toLowerCase().includes('storage areas')
    ),
    section_titles: sectionTitles,
    question_counts_by_section: questionCounts,
    empty_sections: sectionTitles.filter((_, index) => questionCounts[index] === 0),
  }
}

function selectEstateInspectionTemplate(templates) {
  const candidates = (Array.isArray(templates) ? templates : []).filter(isEstateInspectionCandidate)
  return (
    candidates.find((template) => {
      const summary = summarizeTemplate(template)
      return summary.includes_storage_areas && summary.section_count === 14
    }) ||
    candidates.find((template) => summarizeTemplate(template).includes_storage_areas) ||
    candidates.find((template) => summarizeTemplate(template).section_count === 14) ||
    null
  )
}

function buildSnapshot(template) {
  const copy = cloneJson(template)
  copy.name = 'Estate Inspection'
  copy.template_name = 'Estate Inspection'
  copy.template_key = 'esm_inspection'
  copy.template_type = copy.template_type || copy.type || 'esm_inspection'
  copy.type = copy.type || copy.template_type || 'esm_inspection'
  applyEsmInspectionFormPatch(copy)
  copy.questions = Array.isArray(copy.questions)
    ? copy.questions
    : (copy.sections || []).flatMap((section) => section.questions || [])
  return copy
}

async function insertTemplateVersion(snapshot) {
  if (!getPgUrl()) {
    throw new Error('Database is not configured.')
  }
  await ensureDatabase()
  const templateId = String(snapshot.id || 'esm_estate_inspection')
  const templateName = 'Estate Inspection'
  const versionHash = hashSnapshot(snapshot)
  const versionId = `tv_${templateId}_${Date.now()}_${versionHash.slice(0, 8)}`

  await sql`
    INSERT INTO template_versions (id, template_id, template_name, version_hash, snapshot)
    VALUES (${versionId}, ${templateId}, ${templateName}, ${versionHash}, ${JSON.stringify(snapshot)}::jsonb)
  `

  return { versionId, templateId, templateName, versionHash }
}

export async function POST() {
  const access = await getAppAdminAccess()
  if (!access.userId) {
    return NextResponse.json({ error: 'Unauthorized', reason: access.reason }, { status: 401 })
  }
  if (!access.ok) {
    return NextResponse.json({ error: 'Forbidden', reason: access.reason || 'forbidden' }, { status: 403 })
  }

  try {
    const templates = await getTemplatesNested()
    const selected = selectEstateInspectionTemplate(templates)
    if (!selected) {
      return NextResponse.json(
        {
          error: 'No Estate Inspection template found in Airtable response.',
          available_templates: (templates || []).map(summarizeTemplate),
          airtableDiagnostics: getAirtableProductionDiagnostics({
            failing_table: null,
            airtable_status_code: null,
            grading_first_attempt: getLastTemplatesNestedFetchMeta(),
          }),
        },
        { status: 404 }
      )
    }

    const snapshot = buildSnapshot(selected)
    const summary = summarizeTemplate(snapshot)
    const errors = [
      summary.section_count !== 14
        ? `Expected 14 sections, found ${summary.section_count}.`
        : null,
      !summary.includes_storage_areas ? 'Expected a Storage areas section.' : null,
      summary.empty_sections.length > 0
        ? `Expected questions/items in every section; empty sections: ${summary.empty_sections.join(', ')}.`
        : null,
    ].filter(Boolean)

    if (errors.length > 0) {
      return NextResponse.json(
        {
          error: 'Airtable Estate Inspection template failed validation; no snapshot was created.',
          validation_errors: errors,
          selected_template: summary,
          airtableDiagnostics: getAirtableProductionDiagnostics({
            failing_table: null,
            airtable_status_code: null,
            grading_first_attempt: getLastTemplatesNestedFetchMeta(),
          }),
        },
        { status: 422 }
      )
    }

    const inserted = await insertTemplateVersion(snapshot)
    console.warn('Airtable Estate Inspection restored into template_versions fallback.', {
      template_id: inserted.templateId,
      template_version_id: inserted.versionId,
      section_count: summary.section_count,
      includes_storage_areas: summary.includes_storage_areas,
    })

    return NextResponse.json({
      ok: true,
      action: 'created_template_versions_snapshot',
      inserted,
      template: summary,
    })
  } catch (error) {
    const airtableStatus = error.airtableStatus ?? error.statusCode ?? error.status ?? null
    console.error('[restore-esm-template] failed', error)
    return NextResponse.json(
      {
        error: 'Failed to restore Estate Inspection template from Airtable.',
        details: error.message,
        airtableDiagnostics: getAirtableProductionDiagnostics({
          failing_table: error.airtableTableName ?? null,
          airtable_status_code: typeof airtableStatus === 'number' ? airtableStatus : null,
          grading_first_attempt: getLastTemplatesNestedFetchMeta(),
        }),
      },
      { status: typeof airtableStatus === 'number' ? airtableStatus : 500 }
    )
  }
}
