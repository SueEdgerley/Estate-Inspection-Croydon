import { NextResponse } from 'next/server'
import { getTemplatesNested } from '@/lib/airtable-client'
import { getRouteAccess } from '@/lib/permissions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const { denialResponse } = await getRouteAccess({ requireTemplates: true })
  if (denialResponse) return denialResponse

  const hasKey = process.env.AIRTABLE_API_TOKEN || process.env.AIRTABLE_API_KEY || process.env.AIRTABLE_TOKEN
  if (!process.env.AIRTABLE_BASE_ID?.trim() || !hasKey?.trim()) {
    return NextResponse.json(
      {
        error: 'Airtable not configured',
        details: 'Set AIRTABLE_BASE_ID and AIRTABLE_API_KEY (or AIRTABLE_API_TOKEN) in environment variables.',
        hint: 'Vercel → Settings → Environment Variables (Production), then Redeploy.',
        envVarsUrl: 'https://vercel.com/photobook-73dad537/estate-inspection-croydon/settings/environment-variables',
      },
      { status: 503, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    )
  }

  try {
    const templates = await getTemplatesNested()
    return NextResponse.json({ templates }, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    })
  } catch (error) {
    console.error('Error fetching templates:', error)
    return NextResponse.json(
      { error: 'Failed to fetch templates', details: error.message },
      { status: 500 }
    )
  }
}
