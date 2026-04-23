import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '@/lib/db'
import { applyGroundsMaintenanceTemplateToSnapshot } from '@/lib/grounds-maintenance-template'
import { applyTemplateDisplayPatches } from '@/lib/caretaker-fire-template-patch'
import { isEstateInspectionFormTemplate } from '@/lib/standard-inspection-form'
import {
  countQuestionsInTemplate,
  logInspectionQuestionPipeline,
} from '@/lib/estate-inspection-question-pipeline-diag'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request, { params }) {
  const includeQuestionPipelineInBody = request.nextUrl?.searchParams?.get('debug') === '1'
  try {
    await ensureDatabase()
    const pgUrl = getPgUrl()
    if (!pgUrl) {
      return NextResponse.json(
        { error: 'Database not configured. Please set up Postgres.' },
        { status: 503 }
      )
    }
    const { id } = await params

    const result = await sql`
      SELECT i.*,
        tv.created_at AS _template_version_row_created_at,
        tv.version_hash AS _template_version_row_hash
      FROM inspections i
      LEFT JOIN template_versions tv ON tv.id = i.template_version_id
      WHERE i.id = ${id}
    `

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Inspection not found' },
        { status: 404 }
      )
    }

    const row = { ...result.rows[0] }
    const tvCreated = row._template_version_row_created_at
    const tvHash = row._template_version_row_hash
    delete row._template_version_row_created_at
    delete row._template_version_row_hash
    row.template_version_meta = {
      template_version_id: row.template_version_id ?? null,
      version_hash: tvHash ?? null,
      created_at: tvCreated ?? null,
    }
    let tv = row.template_version
    if (typeof tv === 'string') {
      try {
        tv = JSON.parse(tv)
      } catch {
        tv = null
      }
    }
    if (tv && typeof tv === 'object') {
      const patched = applyGroundsMaintenanceTemplateToSnapshot(tv)
      applyTemplateDisplayPatches(patched)
      row.template_version = patched
    } else {
      row.template_version = tv
    }

    const tvOut = row.template_version
    if (tvOut && typeof tvOut === 'object') {
      const estateProbe = {
        id: row.template_id,
        name: row.template_name || tvOut.name,
        template_key: tvOut.template_key ?? row.template_key,
      }
      if (isEstateInspectionFormTemplate(estateProbe)) {
        const counts = countQuestionsInTemplate(tvOut)
        logInspectionQuestionPipeline('http_get_inspection_template_version_response', {
          inspection_id: row.id,
          template_id: row.template_id,
          template_name: row.template_name,
          ...counts,
        })
        if (includeQuestionPipelineInBody) {
          row.questionPipelineDebug = {
            source: 'GET /api/inspections/:id template_version (after snapshot patches)',
            ...counts,
          }
        }
      }
    }

    return NextResponse.json(row)
  } catch (error) {
    console.error('Error fetching inspection:', error)
    return NextResponse.json(
      { error: 'Failed to fetch inspection', details: error.message },
      { status: 500 }
    )
  }
}
