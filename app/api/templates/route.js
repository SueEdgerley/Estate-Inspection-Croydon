import { NextResponse } from 'next/server'
import { getAirtableDiagnosticsForLogging, getTemplatesNested } from '@/lib/airtable-client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const hasKey = process.env.AIRTABLE_API_TOKEN || process.env.AIRTABLE_API_KEY
  if (!process.env.AIRTABLE_BASE_ID?.trim() || !hasKey?.trim()) {
    return NextResponse.json(
      {
        error: 'Airtable not configured',
        details: 'Set AIRTABLE_BASE_ID and AIRTABLE_API_KEY in environment variables.',
        hint: 'Vercel → Settings → Environment Variables (Production), then Redeploy.',
        envVarsUrl: 'https://vercel.com/photobook-73dad537/estate-inspection-croydon/settings/environment-variables',
      },
      { status: 503, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    )
  }

  // TEMPORARY: Production auth diagnosis (no secrets). Remove when resolved.
  console.log('[Airtable diag] GET /api/templates', {
    ...getAirtableDiagnosticsForLogging(),
    note:
      'Production: expect AIRTABLE_API_TOKEN_present=false, credential_chosen=AIRTABLE_API_KEY. If Airtable returns 401, update the key or base access in Airtable.',
  })

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
