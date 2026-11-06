import { NextResponse } from 'next/server'
import { getAppAdminAccess } from '@/lib/app-admin-access'
import { getNeonQuery, getPgUrl } from '@/lib/db'
import { publicAnalyticsTeam } from '@/lib/analytics-teams'
import { createAnalyticsTeam, listAnalyticsTeams } from '@/lib/analytics-teams-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function requireAdmin() {
  const access = await getAppAdminAccess()
  if (!access.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!access.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!getPgUrl()) return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  return null
}

function teamError(error) {
  const status = Number(error?.status) || 500
  return NextResponse.json({ error: error?.message || 'Team update failed' }, { status })
}

export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const teams = await listAnalyticsTeams(getNeonQuery())
    return NextResponse.json({ teams: teams.map((team) => publicAnalyticsTeam(team)) })
  } catch (error) {
    console.error('[analytics teams GET]', error)
    return teamError(error)
  }
}

export async function POST(request) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const body = await request.json().catch(() => ({}))
    const team = await createAnalyticsTeam(getNeonQuery(), {
      name: body.name,
      managerPersonId: body.managerPersonId || null,
    })
    return NextResponse.json({ team: team ? publicAnalyticsTeam(team) : null })
  } catch (error) {
    console.error('[analytics teams POST]', error)
    return teamError(error)
  }
}
