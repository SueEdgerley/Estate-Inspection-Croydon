import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl, getNeonQuery } from '@/lib/db'
import { getCurrentUserEmail, isAdmin } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Inspector emails for the Manage Inspections filter (matches `inspections.inspector_id`).
 * Same visibility rules as GET /api/inspections: owner/admin (or Clerk isAdmin) see all; others only their email.
 */
export async function GET() {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await ensureDatabase()
    if (!getPgUrl()) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
    }

    const userEmail = await getCurrentUserEmail()
    const clerkAdmin = await isAdmin()
    let postgresListAll = false
    try {
      const roleRow = await sql`
        SELECT lower(trim(role)) AS r FROM users WHERE clerk_user_id = ${userId} LIMIT 1
      `
      const r = roleRow.rows[0]?.r || ''
      postgresListAll = r === 'owner' || r === 'admin'
    } catch {
      postgresListAll = false
    }
    const canListAll = clerkAdmin || postgresListAll

    if (!canListAll) {
      const email = typeof userEmail === 'string' && userEmail.trim() ? userEmail.trim() : ''
      return NextResponse.json({
        canFilterByInspector: false,
        groupsAvailable: false,
        inspectors: email ? [{ value: email, label: email }] : [],
        message:
          'You can only see inspections assigned to your account. Ask an owner or admin if you need to filter by other inspectors.',
      })
    }

    const result = await getNeonQuery()(
      `(
        SELECT DISTINCT ON (inspector_id)
          inspector_id AS value,
          COALESCE(NULLIF(trim(inspector_name), ''), inspector_id) AS label
        FROM inspections
        WHERE inspector_id IS NOT NULL AND trim(inspector_id) <> ''
        ORDER BY inspector_id, submitted_at DESC NULLS LAST
      )
      UNION
      (
        SELECT u.email AS value,
          COALESCE(NULLIF(trim(p.name), ''), u.email) AS label
        FROM users u
        LEFT JOIN people p ON lower(trim(p.email)) = lower(trim(u.email))
        WHERE u.email IS NOT NULL AND trim(u.email) <> ''
      )
      ORDER BY label NULLS LAST`,
      []
    )

    const rows = result.rows || []
    const seen = new Set()
    const inspectors = []
    for (const row of rows) {
      const v = row.value != null ? String(row.value).trim() : ''
      if (!v || seen.has(v)) continue
      seen.add(v)
      inspectors.push({
        value: v,
        label: row.label != null && String(row.label).trim() ? String(row.label).trim() : v,
      })
    }

    inspectors.sort((a, b) => a.label.localeCompare(b.label, 'en', { sensitivity: 'base' }))

    return NextResponse.json({
      canFilterByInspector: true,
      groupsAvailable: false,
      inspectors,
      message: null,
    })
  } catch (error) {
    console.error('[inspectors] GET failed:', error)
    return NextResponse.json(
      { error: 'Failed to load inspectors', details: error?.message },
      { status: 500 }
    )
  }
}
