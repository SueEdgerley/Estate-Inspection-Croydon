import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET - Fetch answers for an inspection section
export async function GET(request, { params }) {
  try {
    await ensureDatabase()
    const pgUrl = getPgUrl()
    if (!pgUrl) {
      return NextResponse.json(
        { error: 'Database not configured. Please set up Postgres.' },
        { status: 503 }
      )
    }
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const sectionId = searchParams.get('section_id')

    let query
    if (sectionId) {
      query = sql`
        SELECT 
          id, inspection_id, section_id, question_id, question_type,
          answer_value, answer_text, answer_number, answer_boolean, notes
        FROM inspection_answers
        WHERE inspection_id = ${id} AND section_id = ${sectionId}
      `
    } else {
      query = sql`
        SELECT 
          id, inspection_id, section_id, question_id, question_type,
          answer_value, answer_text, answer_number, answer_boolean, notes
        FROM inspection_answers
        WHERE inspection_id = ${id}
      `
    }

    const result = await query
    return NextResponse.json(result.rows)
  } catch (error) {
    console.error('Error fetching answers:', error)
    return NextResponse.json(
      { error: 'Failed to fetch answers', details: error.message },
      { status: 500 }
    )
  }
}

// POST - Save answers for an inspection section
export async function POST(request, { params }) {
  try {
    await ensureDatabase()
    const pgUrl = getPgUrl()
    if (!pgUrl) {
      return NextResponse.json(
        { error: 'Database not configured. Please set up Postgres.' },
        { status: 503 }
      )
    }
    const { id } = await params
    const data = await request.json()
    const { section_id, answers: answersRaw } = data
    const answers = answersRaw && typeof answersRaw === 'object' ? answersRaw : {}

    // Save each answer
    const savedAnswers = []
    
    for (const [questionId, answerValue] of Object.entries(answers)) {
      const answerId = `answer_${id}_${section_id}_${questionId}_${Date.now()}`
      
      // Handle special fields (comment, priority for Yes/No questions)
      const isCommentField = questionId.endsWith('_comment')
      const isPriorityField = questionId.endsWith('_priority')
      const baseQuestionId = isCommentField || isPriorityField 
        ? questionId.replace(/_comment$/, '').replace(/_priority$/, '')
        : questionId
      
      // Determine answer type and store appropriately
      let answerValueField = null
      let answerText = null
      let answerNumber = null
      let answerBoolean = null
      let notes = null
      let questionType = 'text' // Default, should come from question definition
      
      if (isCommentField) {
        // Store comment in notes field
        notes = String(answerValue)
        answerText = String(answerValue)
        questionType = 'yesno' // Comments are for Yes/No questions
      } else if (typeof answerValue === 'boolean') {
        answerBoolean = answerValue
        questionType = 'yesno'
      } else if (typeof answerValue === 'number') {
        answerNumber = answerValue
        questionType = 'graded'
      } else {
        answerText = String(answerValue)
        answerValueField = String(answerValue)
      }
      
      // Upsert answer (update if exists, insert if not)
      await sql`
        INSERT INTO inspection_answers (
          id, inspection_id, section_id, question_id, question_type,
          answer_value, answer_text, answer_number, answer_boolean, notes
        ) VALUES (
          ${answerId}, ${id}, ${section_id}, ${baseQuestionId}, ${questionType},
          ${answerValueField}, ${answerText}, ${answerNumber}, ${answerBoolean}, ${notes}
        )
        ON CONFLICT (inspection_id, question_id) 
        DO UPDATE SET
          answer_value = EXCLUDED.answer_value,
          answer_text = EXCLUDED.answer_text,
          answer_number = EXCLUDED.answer_number,
          answer_boolean = EXCLUDED.answer_boolean,
          notes = COALESCE(EXCLUDED.notes, inspection_answers.notes),
          updated_at = CURRENT_TIMESTAMP
      `
      
      savedAnswers.push({ question_id: questionId, answer: answerValue })
    }

    return NextResponse.json({ 
      success: true, 
      saved: savedAnswers.length,
      answers: savedAnswers
    })
  } catch (error) {
    console.error('Error saving answers:', error)
    return NextResponse.json(
      { error: 'Failed to save answers', details: error.message },
      { status: 500 }
    )
  }
}
