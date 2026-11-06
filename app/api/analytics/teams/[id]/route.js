import { NextResponse } from 'next/server'
import { getAppAdminAccess } from '@/lib/app-admin-access'
import { getNeonQuery, getPgUrl } from '@/lib/db'
import { publicAnalyticsTeam } from '@/lib/analytics-teams'
import { deleteAnalyticsTeam, updateAnalyticsTeam } from '@/lib/analytics-teams-store'

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

export async function PATCH(request, { params }) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const patch = {}
    if (body.name != null) patch.name = body.name
    if (Object.prototype.hasOwnProperty.call(body, 'managerPersonId')) {
      patch.managerPersonId = body.managerPersonId || null
    }
    if (Array.isArray(body.memberPersonIds)) patch.memberPersonIds = body.memberPersonIds
    const team = await updateAnalyticsTeam(getNeonQuery(), id, patch)
    return NextResponse.json({ team: team ? publicAnalyticsTeam(team) : null })
  } catch (error) {
    console.error('[analytics teams PATCH]', error)
    return teamError(error)
  }
}

export async function DELETE(_request, { params }) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const { id } = await params
    await deleteAnalyticsTeam(getNeonQuery(), id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[analytics teams DELETE]', error)
    return teamError(error)
  }
}
