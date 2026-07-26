import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '@/lib/db'
import { findQuestionInTemplate } from '@/lib/template-question-lookup'
import { resolveStoredQuestionType } from '@/lib/resolveStoredQuestionType'
import { mergeNvNotes } from '@/lib/nv-notes-pack'
import { isWalkaboutSatelliteAnswerId, walkaboutSatelliteParentId } from '@/lib/estate-walkabout-template'

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
    const { section_id, answers: answersRaw, extras: extrasRaw } = data
    const answers = answersRaw && typeof answersRaw === 'object' ? answersRaw : {}
    const extras = extrasRaw && typeof extrasRaw === 'object' ? extrasRaw : {}

    const inspStatusRow = await sql`
      SELECT status, submitted_at FROM inspections WHERE id = ${id} LIMIT 1
    `
    const inspMeta = inspStatusRow.rows[0]
    if (!inspMeta) {
      return NextResponse.json({ error: 'Inspection not found' }, { status: 404 })
    }
    const status = String(inspMeta.status || '').toLowerCase().trim()
    if (inspMeta.submitted_at || status === 'submitted' || status === 'completed' || status === 'complete') {
      return NextResponse.json(
        { error: 'This inspection is locked after submission. Answers and photos cannot be changed.' },
        { status: 403 }
      )
    }

    const inspRow = await sql`
      SELECT template_version FROM inspections WHERE id = ${id} LIMIT 1
    `
    const templateVersion = inspRow.rows[0]?.template_version ?? null

    // Save each answer
    const savedAnswers = []
    
    for (const [questionId, answerValue] of Object.entries(answers)) {
      const answerId = `answer_${id}_${section_id}_${questionId}_${Date.now()}`
      
      // Sibling keys (qid_comment / qid_priority / walkabout satellites) keep their
      // full question_id. Collapsing onto the parent QID overwrote Yes/No answers.
      const isCommentField = questionId.endsWith('_comment')
      const isPriorityField = questionId.endsWith('_priority')
      const isWalkaboutSatellite = isWalkaboutSatelliteAnswerId(questionId)
      const baseQuestionId = isCommentField || isPriorityField
        ? questionId.replace(/_comment$/, '').replace(/_priority$/, '')
        : walkaboutSatelliteParentId(questionId) || questionId
      const storedQuestionId =
        isCommentField || isPriorityField || isWalkaboutSatellite ? questionId : questionId
      
      // Determine answer type and store appropriately
      let answerValueField = null
      let answerText = null
      let answerNumber = null
      let answerBoolean = null
      let notes = null
      let questionType = 'text'

      const qdef =
        !isCommentField && !isPriorityField && !isWalkaboutSatellite
          ? findQuestionInTemplate(templateVersion, baseQuestionId)
          : null

      if (isCommentField || isWalkaboutSatellite) {
        answerText = String(answerValue)
        answerValueField = String(answerValue)
        questionType = 'text'
      } else if (isPriorityField) {
        answerText = String(answerValue)
        answerValueField = String(answerValue)
        questionType = 'text'
      } else if (qdef) {
        questionType = resolveStoredQuestionType(qdef)
        if (questionType === 'graded') {
          answerText = String(answerValue)
          answerValueField = String(answerValue)
        } else if (questionType === 'yesno') {
          if (typeof answerValue === 'boolean') {
            answerBoolean = answerValue
          } else {
            const lower = String(answerValue).toLowerCase()
            answerBoolean = lower === 'yes' ? true : lower === 'no' ? false : null
          }
        } else if (questionType === 'rating' && typeof answerValue === 'number') {
          answerNumber = answerValue
        } else if (typeof answerValue === 'boolean') {
          answerBoolean = answerValue
          questionType = 'yesno'
        } else if (typeof answerValue === 'number') {
          answerNumber = answerValue
        } else {
          answerText = String(answerValue)
          answerValueField = String(answerValue)
        }
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
          ${answerId}, ${id}, ${section_id}, ${storedQuestionId}, ${questionType},
          ${answerValueField}, ${answerText}, ${answerNumber}, ${answerBoolean}, ${notes}
        )
        ON CONFLICT (inspection_id, question_id) 
        DO UPDATE SET
          section_id = EXCLUDED.section_id,
          question_type = EXCLUDED.question_type,
          answer_value = EXCLUDED.answer_value,
          answer_text = EXCLUDED.answer_text,
          answer_number = EXCLUDED.answer_number,
          answer_boolean = EXCLUDED.answer_boolean,
          notes = COALESCE(EXCLUDED.notes, inspection_answers.notes),
          updated_at = CURRENT_TIMESTAMP
      `
      
      savedAnswers.push({ question_id: questionId, answer: answerValue })
    }

    for (const [questionId, patch] of Object.entries(extras)) {
      if (!patch || typeof patch !== 'object') continue
      const prevRes = await sql`
        SELECT id, notes, answer_value, answer_text, question_type, section_id
        FROM inspection_answers
        WHERE inspection_id = ${id} AND question_id = ${questionId}
        LIMIT 1
      `
      const prev = prevRes.rows[0]
      const mergedNotes = mergeNvNotes(prev?.notes, patch)
      if (prev) {
        await sql`
          UPDATE inspection_answers
          SET notes = ${mergedNotes}, updated_at = CURRENT_TIMESTAMP
          WHERE inspection_id = ${id} AND question_id = ${questionId}
        `
      } else {
        const qdef = findQuestionInTemplate(templateVersion, questionId)
        const qt = qdef ? resolveStoredQuestionType(qdef) : 'text'
        const insId = `answer_${id}_${section_id}_${questionId}_${Date.now()}`
        await sql`
          INSERT INTO inspection_answers (
            id, inspection_id, section_id, question_id, question_type,
            answer_value, answer_text, answer_number, answer_boolean, notes
          ) VALUES (
            ${insId}, ${id}, ${section_id}, ${questionId}, ${qt},
            null, ${'completed'}, null, null, ${mergedNotes}
          )
        `
      }
      savedAnswers.push({ question_id: `${questionId}_extras`, answer: 'saved' })
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
