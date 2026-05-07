import { NextResponse } from 'next/server'
import { auth, currentUser } from '@clerk/nextjs/server'
import {
  getAirtableProductionDiagnostics,
  getLastTemplatesNestedFetchMeta,
  getTemplatesNested,
} from '@/lib/airtable-client'
import { filterTemplatesForViewer } from '@/lib/template-visibility'
import { patchCaretakerTemplatesList } from '@/lib/caretaker-fire-template-patch'
import { filterArchivedTemplates } from '@/lib/archived-templates'
import { isEsmInspectionFormTemplate } from '@/lib/esm-inspection-form'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '../../../lib/db'

/** System role + job title for template list filtering (no Airtable changes). */
async function getViewerContext() {
  const { userId } = await auth()
  if (!userId) {
    return { userId: null, systemRole: null, jobTitle: null, clerkIsAdmin: false }
  }
  let systemRole = null
  let jobTitle = null
  let clerkIsAdmin = false
  try {
    const cu = await currentUser()
    clerkIsAdmin = cu?.publicMetadata?.isAdmin === true
  } catch {
    /* ignore */
  }
  try {
    if (getPgUrl()) {
      await ensureDatabase()
      const r = await sql`
        SELECT
          CASE
            WHEN lower(trim(COALESCE(u.role, ''))) = 'owner' THEN 'owner'
            WHEN lower(trim(COALESCE(u.system_role, u.role, ''))) = 'admin' THEN 'admin'
            ELSE 'user'
          END AS system_role,
          COALESCE(
            p.job_title,
            CASE
              WHEN lower(trim(COALESCE(u.role, u.system_role, ''))) IN ('caretaker', 'caretakers') THEN 'Caretaker'
              WHEN lower(trim(COALESCE(u.role, u.system_role, ''))) IN ('housing officer', 'housing_officer', 'housing officers', 'housing_officers') THEN 'Housing Officer'
              WHEN lower(trim(COALESCE(u.role, u.system_role, ''))) IN ('estate services manager', 'estate_services_manager', 'estate service manager', 'estate_service_manager', 'esm') THEN 'ESM'
              ELSE NULL
            END
          ) AS job_title
        FROM users u
        LEFT JOIN people p ON p.id = u.people_id OR lower(trim(p.email)) = lower(trim(COALESCE(u.email, '')))
        WHERE u.clerk_user_id = ${userId}
        ORDER BY CASE WHEN p.id = u.people_id THEN 0 ELSE 1 END
        LIMIT 1
      `
      systemRole = r.rows[0]?.system_role ?? null
      jobTitle = r.rows[0]?.job_title ?? null
    }
  } catch (e) {
    console.warn('[api/templates] role lookup failed:', e?.message)
  }
  return { userId, systemRole, jobTitle, clerkIsAdmin }
}

function applyTemplateVisibility(templates, viewer) {
  if (!viewer.userId) return []
  return filterTemplatesForViewer(templates, viewer)
}

function isEsmOrEstateInspectionCandidate(template) {
  if (isEsmInspectionFormTemplate(template)) return true
  const key = String(template?.template_key ?? '').toLowerCase().trim()
  const name = String(template?.name ?? '').toLowerCase().trim()
  if (key.includes('estate_inspection') || key.includes('esm_inspection')) return true
  if (!name.includes('estate') || !name.includes('inspection')) return false
  return !name.includes('walkabout') && !name.includes('neighbourhood')
}

function logEsmTemplateSections(source, templates) {
  for (const diagnostic of getEsmTemplateDiagnostics(source, templates)) {
    console.log('[ESM template sections]', {
      source: diagnostic.source,
      template_id: diagnostic.template_id,
      template_name: diagnostic.template_name,
      section_count: diagnostic.section_count,
      includes_storage_areas: diagnostic.includes_storage_areas,
      section_titles: diagnostic.section_titles,
      question_counts: diagnostic.question_counts,
    })
  }
}

function getEsmTemplateDiagnostics(source, templates) {
  return (Array.isArray(templates) ? templates : [])
    .filter((template) => isEsmOrEstateInspectionCandidate(template))
    .map((template) => {
      const sections = Array.isArray(template.sections) ? template.sections : []
      const sectionTitles = sections.map((section) => section.title || section.name || '')
      return {
        source,
        template_id: template.id,
        template_name: template.name,
        template_key: template.template_key ?? '',
        section_count: sections.length,
        includes_storage_areas: sectionTitles.some((title) =>
          String(title || '').toLowerCase().includes('storage areas')
        ),
        section_titles: sectionTitles,
        question_counts: sections.map((section) =>
          Array.isArray(section.questions) ? section.questions.length : 0
        ),
      }
    })
}

function buildTemplateSourceDiagnostics(source, templates, extra = {}) {
  return {
    source,
    all_templates: (Array.isArray(templates) ? templates : []).map((template) => {
      const sections = Array.isArray(template?.sections) ? template.sections : []
      const sectionTitles = sections.map((section) => section?.title || section?.name || '')
      return {
        id: template?.id ?? null,
        name: template?.name ?? null,
        template_key: template?.template_key ?? '',
        template_type: template?.template_type ?? template?.type ?? '',
        section_count: sections.length,
        question_count: sections.reduce(
          (sum, section) => sum + (Array.isArray(section?.questions) ? section.questions.length : 0),
          0
        ),
        contains_storage_areas: sectionTitles.some((title) =>
          String(title || '').toLowerCase().includes('storage areas')
        ),
        section_titles: sectionTitles,
        question_counts_by_section: sections.map((section) =>
          Array.isArray(section?.questions) ? section.questions.length : 0
        ),
      }
    }),
    esm: getEsmTemplateDiagnostics(source, templates),
    ...extra,
  }
}

function mergeTemplatesById(primary, additions) {
  const merged = []
  const seen = new Set()
  for (const template of [...(primary || []), ...(additions || [])]) {
    const id = String(template?.id || '')
    if (!id || seen.has(id)) continue
    seen.add(id)
    merged.push(template)
  }
  return merged
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const hasKey = process.env.AIRTABLE_API_TOKEN || process.env.AIRTABLE_API_KEY
  if (!process.env.AIRTABLE_BASE_ID?.trim() || !hasKey?.trim()) {
    return NextResponse.json(
      {
        error: 'Airtable not configured',
        details: 'Set AIRTABLE_BASE_ID and AIRTABLE_API_TOKEN (or legacy AIRTABLE_API_KEY) in environment variables.',
        hint: 'Vercel → Settings → Environment Variables (Production), then Redeploy.',
        envVarsUrl: 'https://vercel.com/photobook-73dad537/estate-inspection-croydon/settings/environment-variables',
        diagnostics: getAirtableProductionDiagnostics(),
      },
      { status: 503, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    )
  }

  const viewer = await getViewerContext()

  try {
    const templates = patchCaretakerTemplatesList(
      applyTemplateVisibility(await getTemplatesNested(), viewer)
    )
    logEsmTemplateSections('airtable_getTemplatesNested', templates)
    const diagnostics = getAirtableProductionDiagnostics({
      failing_table: null,
      airtable_status_code: null,
      grading_first_attempt: getLastTemplatesNestedFetchMeta(),
    })
    console.log('[Airtable diag] GET /api/templates OK', diagnostics)
    return NextResponse.json(
      {
        templates,
        diagnostics,
        templateSource: buildTemplateSourceDiagnostics('airtable_getTemplatesNested', templates, {
          airtable_nested_fetch: getLastTemplatesNestedFetchMeta(),
        }),
      },
      {
        headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
      }
    )
  } catch (error) {
    console.error('Error fetching templates:', error)
    const airtableStatus = error.airtableStatus ?? error.statusCode ?? error.status
    // Fallback: if Airtable auth fails (401), use latest template snapshots from Postgres.
    // This keeps Forms usable on devices even when Airtable auth/config is temporarily failing.
    if (airtableStatus === 401) {
      try {
        await ensureDatabase()
        const pgUrl = getPgUrl()
        if (pgUrl) {
          const fallbackResult = await sql`
            SELECT DISTINCT ON (template_id)
              template_id, template_name, snapshot, created_at
            FROM template_versions
            WHERE snapshot IS NOT NULL
            ORDER BY template_id, created_at DESC
          `
          const rawFallback = fallbackResult.rows
            .map((row) => {
              const snapshot = row.snapshot
              if (!snapshot || typeof snapshot !== 'object') return null
              return {
                row_template_id: row.template_id,
                row_template_name: row.template_name,
                ...snapshot,
              }
            })
            .filter((s) => s && typeof s === 'object')
            .map((s) => ({
              id: s.id ?? s.row_template_id,
              template_key: s.template_key ?? '',
              name: s.name ?? s.template_name ?? s.row_template_name ?? 'Template',
              template_type: s.template_type ?? s.type ?? 'standard',
              type: s.type ?? s.template_type ?? 'standard',
              sections: Array.isArray(s.sections) ? s.sections : [],
            }))
            .filter((t) => t.id)
          const archivedFilteredFallback = filterArchivedTemplates(rawFallback)
          const visibleFallback = applyTemplateVisibility(archivedFilteredFallback, viewer)
          const fallbackEsmTemplates = archivedFilteredFallback.filter(isEsmOrEstateInspectionCandidate)
          const templates = patchCaretakerTemplatesList(
            mergeTemplatesById(visibleFallback, fallbackEsmTemplates.length ? fallbackEsmTemplates : archivedFilteredFallback)
          )
          logEsmTemplateSections('template_versions_fallback', templates)
          if (getEsmTemplateDiagnostics('template_versions_fallback', templates).length > 0) {
            console.warn('Airtable failed; serving ESM fallback template.')
          }
          if (templates.length > 0) {
            const diagnostics = getAirtableProductionDiagnostics({
              failing_table: error.airtableTableName ?? null,
              airtable_status_code: 401,
              grading_first_attempt: getLastTemplatesNestedFetchMeta(),
            })
            return NextResponse.json(
              {
                templates,
                diagnostics,
                templateSource: buildTemplateSourceDiagnostics('template_versions_fallback', templates, {
                  fallback_reason: 'Airtable returned 401 Unauthorized while fetching templates.',
                  fallback_includes_esm: true,
                  airtable_nested_fetch: getLastTemplatesNestedFetchMeta(),
                }),
                warning: 'Airtable returned 401; templates are temporarily loaded from latest Postgres snapshots. ESM may be stale until Airtable auth is fixed.',
                source: 'template_versions_fallback',
              },
              { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
            )
          }
        }
      } catch (fallbackErr) {
        console.error('[api/templates] fallback failed:', fallbackErr)
      }
    }
    const httpStatus =
      typeof airtableStatus === 'number' && airtableStatus >= 400 && airtableStatus < 600
        ? airtableStatus
        : 500
    const diagnostics = getAirtableProductionDiagnostics({
      failing_table: error.airtableTableName ?? null,
      airtable_status_code:
        typeof airtableStatus === 'number' ? airtableStatus : null,
      grading_first_attempt: getLastTemplatesNestedFetchMeta(),
    })
    console.log('[Airtable diag] GET /api/templates ERROR', diagnostics)
    return NextResponse.json(
      {
        error: 'Failed to fetch templates',
        details: error.message,
        diagnostics,
      },
      { status: httpStatus, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    )
  }
}
