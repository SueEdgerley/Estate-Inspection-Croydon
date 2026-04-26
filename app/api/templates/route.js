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
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '../../../lib/db'

/** Role + Clerk admin for template list filtering (no Airtable changes). */
async function getViewerContext() {
  const { userId } = await auth()
  if (!userId) {
    return { userId: null, appRole: null, clerkIsAdmin: false }
  }
  let appRole = null
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
      const r = await sql`SELECT role FROM users WHERE clerk_user_id = ${userId} LIMIT 1`
      appRole = r.rows[0]?.role ?? null
    }
  } catch (e) {
    console.warn('[api/templates] role lookup failed:', e?.message)
  }
  return { userId, appRole, clerkIsAdmin }
}

function applyTemplateVisibility(templates, viewer) {
  if (!viewer.userId) return templates
  return filterTemplatesForViewer(templates, viewer)
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
    const diagnostics = getAirtableProductionDiagnostics({
      failing_table: null,
      airtable_status_code: null,
      grading_first_attempt: getLastTemplatesNestedFetchMeta(),
    })
    console.log('[Airtable diag] GET /api/templates OK', diagnostics)
    return NextResponse.json(
      { templates, diagnostics },
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
            .map((row) => row.snapshot)
            .filter((s) => s && typeof s === 'object')
            .map((s) => ({
              id: s.id,
              template_key: s.template_key ?? '',
              name: s.name ?? s.template_name ?? 'Template',
              sections: Array.isArray(s.sections) ? s.sections : [],
            }))
            .filter((t) => t.id)
          const templates = patchCaretakerTemplatesList(
            applyTemplateVisibility(filterArchivedTemplates(rawFallback), viewer)
          )
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
                warning: 'Airtable returned 401; templates loaded from latest Postgres snapshots.',
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
