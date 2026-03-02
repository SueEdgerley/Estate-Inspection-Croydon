import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST - Save photo record to database
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
    const id = `photo_${data.inspection_id}_${data.question_id}_${Date.now()}`
    
    const result = await sql`
      INSERT INTO inspection_photos (
        id, inspection_id, question_id, blob_url, blob_key, filename
      ) VALUES (
        ${id},
        ${data.inspection_id},
        ${data.question_id},
        ${data.blob_url},
        ${data.blob_key || null},
        ${data.filename || null}
      )
      RETURNING *
    `
    
    return NextResponse.json(result.rows[0], { status: 201 })
  } catch (error) {
    console.error('Error saving photo record:', error)
    return NextResponse.json(
      { error: 'Failed to save photo record', details: error.message },
      { status: 500 }
    )
  }
}

// GET - Get photos for an inspection/question
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
    if (questionId) {
      query = sql`
        SELECT * FROM inspection_photos
        WHERE inspection_id = ${inspectionId} AND question_id = ${questionId}
        ORDER BY uploaded_at DESC
      `
    } else {
      query = sql`
        SELECT * FROM inspection_photos
        WHERE inspection_id = ${inspectionId}
        ORDER BY uploaded_at DESC
      `
    }
    
    const result = await query
    return NextResponse.json(result.rows)
  } catch (error) {
    console.error('Error fetching photos:', error)
    return NextResponse.json(
      { error: 'Failed to fetch photos', details: error.message },
      { status: 500 }
    )
  }
}
