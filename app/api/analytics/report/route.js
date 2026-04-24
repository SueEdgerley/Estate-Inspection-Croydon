import { NextResponse } from 'next/server'
import { auth, currentUser } from '@clerk/nextjs/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '@/lib/db'
import { ensureClerkUserProvisioned } from '@/lib/ensure-clerk-user-provisioned'
import { getCurrentUserEmail, getCurrentUserName } from '@/lib/auth'
import { loadAnalyticsPayload } from '@/lib/analytics-payload'
import { buildAnalyticsReportPdfBuffer } from '@/lib/analytics-report-pdf'
import {
  getAppRoleContextForClerkUser,
  isPrivilegedAdmin,
  mayViewManagerAnalytics,
} from '@/lib/app-role-access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function isUsersTableMissing(err) {
  if (!err) return false
  const code = err.code
  const msg = (err.message || '').toLowerCase()
  return code === '42P01' || msg.includes('does not exist') || msg.includes('relation "users"')
}

export async function GET(request) {
  const authResult = await auth()
  const clerkUserId = authResult?.userId ?? null
  let userEmail = null
  try {
    userEmail = await getCurrentUserEmail()
  } catch {
    /* ignore */
  }

  try {
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }

    const cu = await currentUser()
    const roleCtx = await getAppRoleContextForClerkUser(
      clerkUserId,
      cu?.publicMetadata?.isAdmin === true
    )
    if (!mayViewManagerAnalytics(roleCtx.normalized, roleCtx.clerkIsAdmin)) {
      return NextResponse.json({ error: 'Access denied', code: 'ROLE_NOT_PERMITTED' }, { status: 403 })
    }

    await ensureDatabase()
    try {
      let displayName = null
      try {
        displayName = await getCurrentUserName()
      } catch {
        displayName = null
      }
      await ensureClerkUserProvisioned(clerkUserId, userEmail, { displayName })
    } catch (provErr) {
      if (isUsersTableMissing(provErr)) {
        return NextResponse.json(
          { error: 'DB not migrated', code: 'DB_NOT_MIGRATED' },
          { status: 500 }
        )
      }
    }

    const pgUrl = getPgUrl()
    if (!pgUrl) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
    }

    let userResult
    try {
      userResult = await sql`SELECT id, clerk_user_id, email, role, COALESCE(is_active, true) AS is_active FROM users WHERE clerk_user_id = ${clerkUserId} LIMIT 1`
    } catch (e) {
      if (isUsersTableMissing(e)) {
        return NextResponse.json(
          { error: 'DB not migrated', code: 'DB_NOT_MIGRATED' },
          { status: 500 }
        )
      }
      throw e
    }

    const internalUser = userResult.rows[0] || null
    if (!internalUser) {
      return NextResponse.json({ error: 'User not provisioned', code: 'USER_NOT_PROVISIONED' }, { status: 403 })
    }
    if (internalUser.is_active === false) {
      return NextResponse.json({ error: 'User inactive', code: 'USER_INACTIVE' }, { status: 403 })
    }

    const adminForFilters =
      isPrivilegedAdmin(roleCtx.normalized, roleCtx.clerkIsAdmin) ||
      roleCtx.normalized === 'esm' ||
      roleCtx.normalized === 'housing_officer'

    const { searchParams } = new URL(request.url)
    const { body } = await loadAnalyticsPayload({
      searchParams,
      admin: adminForFilters,
      internalUser,
    })

    let buf
    try {
      buf = await buildAnalyticsReportPdfBuffer(body)
    } catch (pdfErr) {
      console.error('[Analytics PDF] buildAnalyticsReportPdfBuffer:', pdfErr)
      return NextResponse.json(
        {
          error: 'Failed to build PDF',
          details: pdfErr?.message || String(pdfErr),
          hint:
            'If this mentions font or encoding, the server may need pdfkit as a server external package (see next.config.js).',
        },
        { status: 500 }
      )
    }

    const filename = `analytics-report-${new Date().toISOString().slice(0, 10)}.pdf`
    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('[Analytics PDF]', error)
    return NextResponse.json(
      { error: 'Failed to generate report', details: error?.message || String(error) },
      { status: 500 }
    )
  }
}
