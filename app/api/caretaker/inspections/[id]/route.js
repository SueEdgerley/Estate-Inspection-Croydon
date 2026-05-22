import { NextResponse } from 'next/server'
import { auth, currentUser } from '@clerk/nextjs/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '@/lib/db'
import { getCurrentUserEmail } from '@/lib/auth'
import { getAppRoleContextForClerkUser, normalizeJobTitle } from '@/lib/app-role-access'
import { inspectionIsCaretaker } from '@/lib/caretaker-template'
import {
  inspectionIsSubmitted,
  userOwnsInspection,
} from '@/lib/inspection-follow-up-updates'
import { parseCaretakerScopeFromDescription } from '@/lib/caretaker-specific-task-inspection'
import { withInspectionPdfDefaults } from '@/lib/inspection-pdf-fields'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function loadInspectionRow(inspectionId) {
  const result = await sql`
    SELECT
      i.*,
      e.name AS estate_name,
      b.name AS block_name,
      COALESCE(NULLIF(CONCAT_WS(' / ', e.name, b.name), ''), i.location_label, i.title) AS location_line
    FROM inspections i
    LEFT JOIN estates e ON e.id = i.estate_id
    LEFT JOIN blocks b ON b.id = i.block_id
    WHERE i.id = ${inspectionId}
    LIMIT 1
  `
  return result.rows[0] || null
}

/** Caretaker-only: own submitted inspection summary for mobile report view. */
export async function GET(_request, { params }) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    await ensureDatabase()
    if (!getPgUrl()) {
      return NextResponse.json({ error: 'Database not configured.' }, { status: 503 })
    }

    const { id } = await params
    const row = await loadInspectionRow(id)
    if (!row) {
      return NextResponse.json({ error: 'Inspection not found' }, { status: 404 })
    }

    const cu = await currentUser()
    const roleCtx = await getAppRoleContextForClerkUser(userId, cu?.publicMetadata?.isAdmin === true)
    if (normalizeJobTitle(roleCtx?.jobTitle) !== 'caretaker') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const userEmail = await getCurrentUserEmail()
    if (!userOwnsInspection(userEmail, row)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (!inspectionIsSubmitted(row)) {
      return NextResponse.json({ error: 'Inspection is not submitted yet.' }, { status: 403 })
    }

    if (!inspectionIsCaretaker(row)) {
      return NextResponse.json({ error: 'Not a caretaker inspection.' }, { status: 403 })
    }

    const scope = parseCaretakerScopeFromDescription(row.description)

    return NextResponse.json(
      withInspectionPdfDefaults({
        id: row.id,
        template_name: row.template_name,
        template_id: row.template_id,
        location_label: row.location_label || row.title,
        location_line: row.location_line,
        estate_name: row.estate_name,
        block_name: row.block_name,
        inspector_name: row.inspector_name,
        inspector_id: row.inspector_id,
        submitted_at: row.submitted_at ? new Date(row.submitted_at).toISOString() : null,
        inspection_start_time: row.inspection_start_time
          ? new Date(row.inspection_start_time).toISOString()
          : null,
        inspection_end_time: row.inspection_end_time
          ? new Date(row.inspection_end_time).toISOString()
          : null,
        status: row.status,
        grading: row.grading,
        scope_label: scope.scopeLabel,
        full_pdf_url: row.full_pdf_url,
        pdf_url: row.pdf_url,
        pdf_generation_error: row.pdf_generation_error,
      })
    )
  } catch (error) {
    console.error('[caretaker/inspections GET]', error)
    return NextResponse.json(
      { error: 'Failed to load inspection', details: error?.message || String(error) },
      { status: 500 }
    )
  }
}
