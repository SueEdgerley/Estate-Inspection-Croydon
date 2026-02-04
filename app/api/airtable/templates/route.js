import { NextResponse } from 'next/server'
import { getTemplates, normalizeTemplate } from '@/lib/airtable-client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET - Fetch templates from Airtable
export async function GET() {
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
