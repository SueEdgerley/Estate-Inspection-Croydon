import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '@/lib/db'
import { getOwnRecordViewer, ownRecordInspectionForbidden } from '@/lib/own-record-access'
import {
  listCaretakerEstatesRecovery,
  recoverCaretakerEstatesMailboxNotifications,
} from '@/lib/caretaker-estates-mailbox-action'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function inspectionForViewer(id) {
  const viewer = await getOwnRecordViewer()
  if (viewer.error) return { error: viewer.error }
  await ensureDatabase()
  if (!getPgUrl()) {
    return {
      error: NextResponse.json({ error: 'Database not configured. Please set up Postgres.' }, { status: 503 }),
    }
  }
  const inspection = await sql`
    SELECT id, inspector_id
    FROM inspections
    WHERE id = ${id}
    LIMIT 1
  `
  if (!inspection.rows[0]) {
    return { error: NextResponse.json({ error: 'Inspection not found' }, { status: 404 }) }
  }
  const forbidden = ownRecordInspectionForbidden(viewer, inspection.rows[0].inspector_id)
  if (forbidden) return { error: forbidden }
  return { id }
}

export async function GET(_request, { params }) {
  try {
    const { id } = await params
    const access = await inspectionForViewer(id)
    if (access.error) return access.error
    const pending = await listCaretakerEstatesRecovery(sql, id)
    return NextResponse.json({ pending })
  } catch (error) {
    console.error('[estates-notification-retry] list failed:', error)
    return NextResponse.json({ error: 'Could not check the Estate Services retry.' }, { status: 500 })
  }
}

export async function POST(_request, { params }) {
  try {
    const { id } = await params
    const access = await inspectionForViewer(id)
    if (access.error) return access.error
    const recovery = await recoverCaretakerEstatesMailboxNotifications(sql, id)
    const pending = await listCaretakerEstatesRecovery(sql, id)
    return NextResponse.json({
      sent: recovery.sent || 0,
      skipped: recovery.skipped || 0,
      failed: recovery.failed || [],
      warnings: recovery.warnings || [],
      pending,
    })
  } catch (error) {
    console.error('[estates-notification-retry] retry failed:', error)
    return NextResponse.json({ error: 'Could not retry the Estate Services notification.' }, { status: 500 })
  }
}
