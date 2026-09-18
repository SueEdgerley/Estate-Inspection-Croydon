import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '@/lib/db'
import { deriveInspectionGrading } from '@/lib/deriveInspectionGrading'
import { buildGradedValidationReport } from '@/lib/gradedInspectionValidation'
import { getOwnRecordViewer, ownRecordInspectionForbidden } from '@/lib/own-record-access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET — QA: compare template graded questions to inspection_answers + derived grading.
 */
export async function GET(request, { params }) {
  try {
    const viewer = await getOwnRecordViewer()
    if (viewer.error) return viewer.error

    await ensureDatabase()
    const pgUrl = getPgUrl()
    if (!pgUrl) {
      return NextResponse.json({ error: 'Database not configured.' }, { status: 503 })
    }
    const { id } = await params

    const insp = await sql`
      SELECT id, template_version, grading, status, submitted_at, inspector_id
      FROM inspections
      WHERE id = ${id}
      LIMIT 1
    `
    if (insp.rows.length === 0) {
      return NextResponse.json({ error: 'Inspection not found' }, { status: 404 })
    }
    const forbidden = ownRecordInspectionForbidden(viewer, insp.rows[0].inspector_id)
    if (forbidden) return forbidden

    const row = insp.rows[0]
    const template = row.template_version

    const answersResult = await sql`
      SELECT question_id, question_type, answer_value, answer_text, answer_number
      FROM inspection_answers
      WHERE inspection_id = ${id}
    `

    const answersByQuestionId = {}
    answersResult.rows.forEach((r) => {
      answersByQuestionId[r.question_id] =
        r.answer_value ?? r.answer_text ?? (r.answer_number != null ? String(r.answer_number) : undefined)
    })

    const derivedGrading = deriveInspectionGrading(template, answersByQuestionId)
    const report = buildGradedValidationReport(template, answersResult.rows)

    return NextResponse.json({
      inspection_id: id,
      status: row.status,
      submitted_at: row.submitted_at,
      inspections_grading_column: row.grading,
      derived_inspection_grading: derivedGrading,
      derived_matches_column: (row.grading || null) === (derivedGrading || null),
      ...report,
    })
  } catch (error) {
    console.error('[graded-validation]', error)
    return NextResponse.json(
      { error: 'Failed to build validation report', details: error.message },
      { status: 500 }
    )
  }
}
