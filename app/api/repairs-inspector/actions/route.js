import { NextResponse } from 'next/server'
import { auth, currentUser } from '@clerk/nextjs/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '@/lib/db'
import { getAppRoleContextForClerkUser, roleMayViewGlobalActionsList } from '@/lib/app-role-access'
import { ensureRepairActionFields } from '@/lib/repair-action-fields'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const cu = await currentUser()
    const roleCtx = await getAppRoleContextForClerkUser(userId, cu?.publicMetadata?.isAdmin === true)
    if (!roleMayViewGlobalActionsList(roleCtx.normalized, roleCtx.clerkIsAdmin)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (!getPgUrl()) return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
    await ensureDatabase()
    await ensureRepairActionFields(sql)

    const result = await sql`
      SELECT
        a.id, a.inspection_id, a.section_id, a.section_name, a.question_id,
        a.category, a.priority, a.title, a.description, a.location, a.status, a.comment,
        a.photo_urls, a.issue_pdf_url, a.job_number, a.expected_completion_date,
        a.repair_notes, a.repair_photo_url, a.repair_updated_at,
        a.created_at, a.updated_at,
        i.title AS inspection_title,
        i.submitted_at AS inspection_date,
        COALESCE(NULLIF(CONCAT_WS(' / ', e.name, b.name), ''), i.location_label, i.title) AS estate_block_name,
        p.name AS recipient_name,
        p.job_title AS recipient_job_title,
        p.category AS recipient_category
      FROM actions a
      LEFT JOIN inspections i ON i.id = a.inspection_id
      LEFT JOIN estates e ON e.id = i.estate_id
      LEFT JOIN blocks b ON b.id = i.block_id
      LEFT JOIN people p ON p.id = a.recipient_person_id
      WHERE COALESCE(lower(a.status), 'open') NOT IN ('completed', 'closed')
        AND (
          lower(COALESCE(a.category, '')) IN ('repair', 'repairs')
          OR lower(COALESCE(a.category, '')) LIKE '%repair%'
          OR lower(COALESCE(a.section_name, '')) LIKE '%repair%'
          OR lower(COALESCE(a.title, '')) LIKE '%repair%'
          OR lower(COALESCE(a.description, '')) LIKE '%repair%'
          OR lower(COALESCE(a.comment, '')) LIKE '%repair%'
          OR lower(COALESCE(p.name, '')) LIKE '%repair%'
          OR lower(COALESCE(p.job_title, '')) LIKE '%repair%'
          OR lower(COALESCE(p.category, '')) LIKE '%repair%'
        )
      ORDER BY a.updated_at DESC, a.created_at DESC
      LIMIT 500
    `

    return NextResponse.json(result.rows)
  } catch (error) {
    console.error('[repairs-inspector/actions] GET:', error)
    return NextResponse.json(
      { error: 'Failed to load repair actions', details: error?.message || String(error) },
      { status: 500 }
    )
  }
}
