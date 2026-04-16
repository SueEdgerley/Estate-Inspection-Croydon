import { NextResponse } from 'next/server'
import { getAppAdminAccess } from '@/lib/app-admin-access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Lightweight gate for admin-only UI (Settings, Data Import). */
export async function GET() {
  const access = await getAppAdminAccess()
  if (!access.userId) {
    return NextResponse.json({ allowed: false, reason: access.reason }, { status: 401 })
  }
  if (!access.ok) {
    return NextResponse.json({ allowed: false, reason: access.reason || 'forbidden' }, { status: 403 })
  }
  return NextResponse.json({ allowed: true })
}
