import { NextResponse } from 'next/server'
import { getSectionQuestions, normalizeQuestion } from '@/lib/airtable-client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET - Fetch questions for a section
export async function GET(request, { params }) {
  try {
    const { sectionId } = await params
    
    const questions = await getSectionQuestions(sectionId)
    const normalized = questions.map(normalizeQuestion)
    
    return NextResponse.json(normalized)
  } catch (error) {
    console.error('Error fetching questions:', error)
    return NextResponse.json(
      { error: 'Failed to fetch questions', details: error.message },
      { status: 500 }
    )
  }
}
