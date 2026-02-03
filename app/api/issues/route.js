import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase } from '@/lib/db'

// Route segment config
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET - Fetch all issues
export async function GET() {
  try {
    await ensureDatabase()
    
    // Check if database is configured
    if (!process.env.POSTGRES_URL) {
      return NextResponse.json(
        { error: 'Database not configured. Please set up Vercel Postgres.' },
        { status: 503 }
      )
    }
    
    const result = await sql`
      SELECT 
        id,
        type,
        title,
        description,
        location,
        status,
        created_at as "createdAt"
      FROM issues
      ORDER BY created_at DESC
    `
    
    return NextResponse.json(result.rows)
  } catch (error) {
    console.error('Error fetching issues:', error)
    return NextResponse.json(
      { error: 'Failed to fetch issues', details: error.message },
      { status: 500 }
    )
  }
}

// POST - Create a new issue
export async function POST(request) {
  try {
    await ensureDatabase()
    
    // Check if database is configured
    if (!process.env.POSTGRES_URL) {
      return NextResponse.json(
        { error: 'Database not configured. Please set up Vercel Postgres.' },
        { status: 503 }
      )
    }
    
    const body = await request.json()
    const { type, title, description, location } = body
    
    // Validation
    if (!title || !title.trim()) {
      return NextResponse.json(
        { error: 'Title is required' },
        { status: 400 }
      )
    }
    
    const id = Date.now().toString()
    const status = 'open'
    
    await sql`
      INSERT INTO issues (id, type, title, description, location, status)
      VALUES (${id}, ${type || 'repairs'}, ${title}, ${description || ''}, ${location || ''}, ${status})
    `
    
    const newIssue = {
      id,
      type: type || 'repairs',
      title,
      description: description || '',
      location: location || '',
      status,
      createdAt: new Date().toISOString(),
    }
    
    return NextResponse.json(newIssue, { status: 201 })
  } catch (error) {
    console.error('Error creating issue:', error)
    return NextResponse.json(
      { error: 'Failed to create issue' },
      { status: 500 }
    )
  }
}
