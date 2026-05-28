import { NextResponse } from 'next/server'
import { auth, currentUser } from '@clerk/nextjs/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '@/lib/db'
import { getCurrentUserEmail } from '@/lib/auth'
import {
  getAppRoleContextForClerkUser,
  normalizeJobTitle,
  roleBypassesOperationalRouteRestrictions,
} from '@/lib/app-role-access'
import { parseCaretakerScopeFromDescription } from '@/lib/caretaker-specific-task-inspection'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Caretaker-only list of own submitted inspections (for follow-up updates). */
export async function GET() {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    await ensureDatabase()
    if (!getPgUrl()) {
      return NextResponse.json({ error: 'Database not configured.' }, { status: 503 })
    }

    const cu = await currentUser()
    const roleCtx = await getAppRoleContextForClerkUser(userId, cu?.publicMetadata?.isAdmin === true)
    const elevatedAccess = roleBypassesOperationalRouteRestrictions(roleCtx)
    if (!elevatedAccess && normalizeJobTitle(roleCtx?.jobTitle) !== 'caretaker') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const userEmail = await getCurrentUserEmail()
    if (!elevatedAccess && !userEmail) {
      return NextResponse.json({ error: 'Could not resolve signed-in user.' }, { status: 400 })
    }

    const result = await sql`
      SELECT
        i.id,
        i.template_name,
        i.location_label,
        i.title,
        i.submitted_at,
        i.status,
        i.description,
        e.name AS estate_name,
        b.name AS block_name,
        (
          SELECT COUNT(*)::int
          FROM inspection_updates u
          WHERE u.inspection_id = i.id
        ) AS update_count
      FROM inspections i
      LEFT JOIN estates e ON e.id = i.estate_id
      LEFT JOIN blocks b ON b.id = i.block_id
      WHERE (${elevatedAccess} = true OR lower(trim(COALESCE(i.inspector_id, ''))) = lower(trim(${userEmail || ''})))
        AND (
          i.submitted_at IS NOT NULL
          OR lower(trim(COALESCE(i.status, ''))) IN ('submitted', 'completed', 'complete')
        )
        AND (
          lower(COALESCE(i.template_name, '')) LIKE '%caretaker%'
          OR lower(COALESCE(i.work_type, '')) LIKE '%caretaker%'
          OR lower(COALESCE(i.type, '')) LIKE '%caretaker%'
        )
      ORDER BY i.submitted_at DESC NULLS LAST, i.updated_at DESC
      LIMIT 100
    `

    const inspections = result.rows.map((row) => {
      const scope = parseCaretakerScopeFromDescription(row.description)
      return {
        id: row.id,
        template_name: row.template_name,
        location_label: row.location_label || row.title,
        estate_name: row.estate_name,
        block_name: row.block_name,
        submitted_at: row.submitted_at ? new Date(row.submitted_at).toISOString() : null,
        status: row.status,
        scope_label: scope.scopeLabel,
        update_count: row.update_count || 0,
      }
    })

    return NextResponse.json({ inspections })
  } catch (error) {
    console.error('[caretaker/my-inspections GET]', error)
    return NextResponse.json(
      { error: 'Failed to load inspections', details: error?.message || String(error) },
      { status: 500 }
    )
  }
}
