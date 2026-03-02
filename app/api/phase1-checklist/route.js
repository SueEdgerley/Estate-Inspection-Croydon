import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { getPgUrl } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Phase 1 minimal verification: tables exist, inspection submit writes to DB,
 * template snapshot and dual PDF URLs are stored, tasks/outbound_emails exist.
 * No analytics or fancy reporting.
 */
export async function GET() {
  const checks = {
    database: false,
    inspectionsTable: false,
    inspectionAnswersTable: false,
    inspectionPhotosTable: false,
    templateVersionColumn: false,
    fullPdfUrlColumn: false,
    posterPdfUrlColumn: false,
    estatesTable: false,
    blocksTable: false,
    userAssignmentsTable: false,
    tasksTable: false,
    outboundEmailsTable: false,
    recentInspection: null,
    errors: [],
  }

  if (!getPgUrl()) {
    checks.errors.push('POSTGRES_URL / DATABASE_URL not set')
    return NextResponse.json(checks)
  }

  try {
    await sql`SELECT 1`
    checks.database = true
  } catch (e) {
    checks.errors.push('Database connection: ' + e.message)
    return NextResponse.json(checks)
  }

  try {
    await sql`SELECT 1 FROM inspections LIMIT 1`
    checks.inspectionsTable = true
  } catch (e) {
    checks.errors.push('inspections: ' + e.message)
  }

  try {
    await sql`SELECT 1 FROM inspection_answers LIMIT 1`
    checks.inspectionAnswersTable = true
  } catch (e) {
    checks.errors.push('inspection_answers: ' + e.message)
  }

  try {
    await sql`SELECT 1 FROM inspection_photos LIMIT 1`
    checks.inspectionPhotosTable = true
  } catch (e) {
    checks.errors.push('inspection_photos: ' + e.message)
  }

  try {
    const r = await sql`SELECT template_version, full_pdf_url, poster_pdf_url FROM inspections LIMIT 1`
    if (r.rows.length) {
      const row = r.rows[0]
      checks.templateVersionColumn = row.template_version != null
      checks.fullPdfUrlColumn = 'full_pdf_url' in row
      checks.posterPdfUrlColumn = 'poster_pdf_url' in row
    } else {
      checks.templateVersionColumn = true
      checks.fullPdfUrlColumn = true
      checks.posterPdfUrlColumn = true
    }
  } catch (e) {
    checks.errors.push('inspections columns (template_version, full_pdf_url, poster_pdf_url): ' + e.message)
  }

  try {
    await sql`SELECT 1 FROM estates LIMIT 1`
    checks.estatesTable = true
  } catch (e) {
    checks.errors.push('estates: ' + e.message)
  }

  try {
    await sql`SELECT 1 FROM blocks LIMIT 1`
    checks.blocksTable = true
  } catch (e) {
    checks.errors.push('blocks: ' + e.message)
  }

  try {
    await sql`SELECT 1 FROM user_assignments LIMIT 1`
    checks.userAssignmentsTable = true
  } catch (e) {
    checks.errors.push('user_assignments: ' + e.message)
  }

  try {
    await sql`SELECT 1 FROM tasks LIMIT 1`
    checks.tasksTable = true
  } catch (e) {
    checks.errors.push('tasks: ' + e.message)
  }

  try {
    await sql`SELECT 1 FROM outbound_emails LIMIT 1`
    checks.outboundEmailsTable = true
  } catch (e) {
    checks.errors.push('outbound_emails: ' + e.message)
  }

  try {
    const recent = await sql`
      SELECT id, template_id, template_name, template_version IS NOT NULL AS has_snapshot,
             full_pdf_url, poster_pdf_url, pdf_url, estate_id, block_id, inspector_id
      FROM inspections
      ORDER BY submitted_at DESC NULLS LAST
      LIMIT 1
    `
    if (recent.rows.length) checks.recentInspection = recent.rows[0]
  } catch (e) {
    checks.errors.push('recent inspection: ' + e.message)
  }

  const allTables =
    checks.inspectionsTable &&
    checks.inspectionAnswersTable &&
    checks.inspectionPhotosTable &&
    checks.estatesTable &&
    checks.blocksTable &&
    checks.userAssignmentsTable &&
    checks.tasksTable &&
    checks.outboundEmailsTable

  return NextResponse.json({
    ...checks,
    phase1Ready: allTables && checks.database && checks.errors.length === 0,
  })
}
