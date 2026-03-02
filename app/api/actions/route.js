import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET - Fetch all actions
export async function GET(request) {
  try {
    await ensureDatabase()
    const pgUrl = getPgUrl()
    if (!pgUrl) {
      return NextResponse.json(
        { error: 'Database not configured. Please set up Postgres.' },
        { status: 503 }
      )
    }
    const { searchParams } = new URL(request.url)
    const inspectionId = searchParams.get('inspection_id')
    const questionId = searchParams.get('question_id')
    
    let query
    if (inspectionId && questionId) {
      query = sql`
        SELECT 
          id, inspection_id, section_id, section_name, question_id,
          category, priority, title, description, location, status,
          comment, recipient_person_id, auto_created,
          created_at, updated_at
        FROM actions
        WHERE inspection_id = ${inspectionId} AND question_id = ${questionId}
        ORDER BY created_at DESC
      `
    } else if (inspectionId) {
      query = sql`
        SELECT 
          id, inspection_id, section_id, section_name, question_id,
          category, priority, title, description, location, status,
          comment, recipient_person_id, auto_created,
          created_at, updated_at
        FROM actions
        WHERE inspection_id = ${inspectionId}
        ORDER BY created_at DESC
      `
    } else {
      query = sql`
        SELECT 
          id, inspection_id, section_id, section_name, question_id,
          category, priority, title, description, location, status,
          comment, recipient_person_id, auto_created,
          created_at, updated_at
        FROM actions
        ORDER BY created_at DESC
      `
    }
    
    const result = await query
    return NextResponse.json(result.rows)
  } catch (error) {
    console.error('Error fetching actions:', error)
    return NextResponse.json(
      { error: 'Failed to fetch actions', details: error.message },
      { status: 500 }
    )
  }
}

// POST - Create a new action
export async function POST(request) {
  try {
    await ensureDatabase()
    const pgUrl = getPgUrl()
    if (!pgUrl) {
      return NextResponse.json(
        { error: 'Database not configured. Please set up Postgres.' },
        { status: 503 }
      )
    }
    const data = await request.json()
    
    // Generate ID if not provided
    const id = data.id || `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    const result = await sql`
      INSERT INTO actions (
        id,
        inspection_id,
        section_id,
        section_name,
        question_id,
        category,
        priority,
        title,
        description,
        location,
        status,
        comment,
        recipient_person_id,
        auto_created
      ) VALUES (
        ${id},
        ${data.inspection_id || null},
        ${data.section_id || null},
        ${data.section_name || null},
        ${data.question_id || null},
        ${data.category || 'other'},
        ${data.priority || null},
        ${data.title},
        ${data.description || null},
        ${data.location || null},
        ${data.status || 'open'},
        ${data.comment || null},
        ${data.recipient_person_id || null},
        ${data.auto_created || false}
      )
      RETURNING *
    `
    
    return NextResponse.json(result.rows[0], { status: 201 })
  } catch (error) {
    console.error('Error creating action:', error)
    return NextResponse.json(
      { error: 'Failed to create action', details: error.message },
      { status: 500 }
    )
  }
}
