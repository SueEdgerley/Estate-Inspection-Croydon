import { NextResponse } from 'next/server'
import { getBlocks } from '@/lib/airtable-client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const hasKey =
    process.env.AIRTABLE_API_TOKEN ||
    process.env.AIRTABLE_API_KEY ||
    process.env.AIRTABLE_TOKEN

  if (!process.env.AIRTABLE_BASE_ID?.trim() || !hasKey?.trim()) {
    return NextResponse.json(
      {
        error: 'Airtable not configured',
        details:
          'Set AIRTABLE_BASE_ID and AIRTABLE_API_KEY (or AIRTABLE_API_TOKEN) in environment variables.',
      },
      { status: 503, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    )
  }

  try {
    const records = await getBlocks()
    const blocks = records.map((r) => ({
      id: r.id,
      name:
        r['Name'] ??
        r['Block Name'] ??
        r['Block'] ??
        r['Title'] ??
        r.name ??
        r.label ??
        r.id,
    }))

    return NextResponse.json(
      { blocks },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    )
  } catch (error) {
    console.error('Error fetching blocks from Airtable:', error)
    return NextResponse.json(
      { error: 'Failed to fetch blocks', details: error.message },
      { status: 500 }
    )
  }
}

