import { NextResponse } from 'next/server'
import { getTemplates, normalizeTemplate } from '@/lib/airtable-client'
import { getRouteAccess } from '@/lib/permissions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET - Fetch templates from Airtable
export async function GET() {
  const { denialResponse } = await getRouteAccess({ requireTemplates: true })
  if (denialResponse) return denialResponse

  try {
    const templates = await getTemplates()
    const normalized = templates.map(normalizeTemplate)
    
    return NextResponse.json(normalized)
  } catch (error) {
    console.error('Error fetching templates:', error)
    return NextResponse.json(
      { error: 'Failed to fetch templates', details: error.message },
      { status: 500 }
    )
  }
}
