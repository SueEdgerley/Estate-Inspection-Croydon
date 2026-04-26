import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import {
  getAirtableProductionDiagnostics,
  getLastTemplatesNestedFetchMeta,
  getTemplatesNested,
} from '@/lib/airtable-client'
import { patchCaretakerTemplatesList } from '@/lib/caretaker-fire-template-patch'
import { applyNeighbourhoodVoicePatchesToList } from '@/lib/neighbourhood-voice-template-patch'
import { applyTemplateDisplayPatches } from '@/lib/caretaker-fire-template-patch'
import { ensureDatabase, getPgUrl } from '@/lib/db'
import { filterArchivedTemplates } from '@/lib/archived-templates'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value))
}

function summarizeTemplate(template, source) {
  const sections = Array.isArray(template?.sections) ? template.sections : []
  const questions = sections.flatMap((section) =>
    (Array.isArray(section.questions) ? section.questions : []).map((question) => ({ section, question }))
  )
  const hiddenQuestions = questions.filter(({ question }) => question?.nv_hidden).length
  const firstQuestions = questions.slice(0, 10).map(({ section, question }) => ({
    section: section.title || section.name || section.id || '',
    question_id: question.id ?? null,
    name: String(question.resident_wording || question.question_text || question.label || question.id || '').slice(0, 180),
    type: question.nv_render_kind || question.question_type || question.answer_mode || null,
    hidden: question.nv_hidden === true,
  }))

  return {
    template_id: template?.id ?? null,
    template_key: template?.template_key ?? null,
    template_name: template?.name ?? template?.template_name ?? 'Template',
    source,
    section_count: sections.length,
    question_count: questions.length,
    hidden_question_count: hiddenQuestions,
    first_10_questions: firstQuestions,
    warnings: [
      questions.length === 0 ? 'Question count is 0' : null,
      sections.length === 0 ? 'Section count is 0' : null,
      hiddenQuestions > 0 ? `${hiddenQuestions} questions are marked hidden` : null,
    ].filter(Boolean),
  }
}

function applyClientSideNewInspectionPatches(template) {
  const copy = cloneJson(template)
  applyNeighbourhoodVoicePatchesToList([copy])
  applyTemplateDisplayPatches(copy)
  return copy
}

async function loadTemplatesFromSnapshotFallback() {
  const pgUrl = getPgUrl()
  if (!pgUrl) return []
  await ensureDatabase()
  const fallbackResult = await sql`
    SELECT DISTINCT ON (template_id)
      template_id, template_name, snapshot, created_at
    FROM template_versions
    WHERE snapshot IS NOT NULL
    ORDER BY template_id, created_at DESC
  `
  const templates = fallbackResult.rows
    .map((row) => row.snapshot)
    .filter((snapshot) => snapshot && typeof snapshot === 'object')
    .map((snapshot) => ({
      id: snapshot.id,
      template_key: snapshot.template_key ?? '',
      name: snapshot.name ?? snapshot.template_name ?? 'Template',
      sections: Array.isArray(snapshot.sections) ? snapshot.sections : [],
    }))
    .filter((template) => template.id)
  return filterArchivedTemplates(templates)
}

export async function GET(request) {
  try {
    const templateId = request.nextUrl?.searchParams?.get('template_id')
    let source = 'Airtable via getTemplatesNested + server patches'
    let templates

    try {
      templates = patchCaretakerTemplatesList(await getTemplatesNested())
    } catch (error) {
      const airtableStatus = error.airtableStatus ?? error.statusCode ?? error.status
      if (airtableStatus !== 401) throw error
      templates = patchCaretakerTemplatesList(await loadTemplatesFromSnapshotFallback())
      source = 'template_versions fallback (Airtable 401)'
    }

    if (templateId) {
      const template = templates.find((item) => item.id === templateId)
      if (!template) {
        return NextResponse.json({ error: 'Template not found' }, { status: 404 })
      }
      return NextResponse.json({
        source,
        template,
      })
    }

    const diagnostics = templates.map((template) => {
      const loaded = summarizeTemplate(template, source)
      const afterClientPatch = summarizeTemplate(
        applyClientSideNewInspectionPatches(template),
        `${source} + /inspections/new client patches`
      )
      const patchWarnings = []
      if (afterClientPatch.question_count !== loaded.question_count) {
        patchWarnings.push(
          `Client patches changed question count from ${loaded.question_count} to ${afterClientPatch.question_count}`
        )
      }
      if (afterClientPatch.hidden_question_count > loaded.hidden_question_count) {
        patchWarnings.push(
          `Client patches increased hidden questions from ${loaded.hidden_question_count} to ${afterClientPatch.hidden_question_count}`
        )
      }
      return {
        ...loaded,
        after_client_patch: {
          section_count: afterClientPatch.section_count,
          question_count: afterClientPatch.question_count,
          hidden_question_count: afterClientPatch.hidden_question_count,
        },
        warnings: [...loaded.warnings, ...patchWarnings],
      }
    })

    return NextResponse.json({
      source,
      diagnostics,
      airtableDiagnostics: getAirtableProductionDiagnostics({
        failing_table: null,
        airtable_status_code: null,
        grading_first_attempt: getLastTemplatesNestedFetchMeta(),
      }),
    })
  } catch (error) {
    console.error('[template-diagnostics] failed', error)
    return NextResponse.json(
      { error: 'Failed to load template diagnostics', details: error.message },
      { status: 500 }
    )
  }
}
