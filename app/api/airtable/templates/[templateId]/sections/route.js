import { NextResponse } from 'next/server'
import { getTemplateSections, normalizeSection } from '@/lib/airtable-client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET - Fetch sections for a template
export async function GET(request, { params }) {
  try {
    const { templateId } = await params
    
    const sections = await getTemplateSections(templateId)
    const normalized = sections.map(normalizeSection)
    
    return NextResponse.json(normalized)
  } catch (error) {
    console.error('Error fetching sections:', error)
    return NextResponse.json(
      { error: 'Failed to fetch sections', details: error.message },
      { status: 500 }
    )
  }
}
