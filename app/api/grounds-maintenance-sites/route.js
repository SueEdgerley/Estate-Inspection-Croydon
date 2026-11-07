import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { groundsSiteLocationOptions } from '@/lib/grounds-maintenance-sites'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const sites = groundsSiteLocationOptions().map((site) => ({
      id: site.id,
      name: site.name,
      lotId: site.lotId,
      lotLabel: site.lotLabel,
      contractor: site.contractor,
      siteName: site.siteName,
      siteReference: site.siteReference,
    }))
    return NextResponse.json({
      writtenToProduction: false,
      sites,
    })
  } catch (error) {
    console.error('[grounds-maintenance-sites]', error)
    return NextResponse.json({ error: 'Grounds Maintenance site list is not available' }, { status: 500 })
  }
}
