import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '@/lib/db'
import { getTemplateById } from '@/lib/airtable-client'

// Route segment config
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET - Fetch all issues
export async function GET() {
  try {
    await ensureDatabase()
    const pgUrl = getPgUrl()
    if (!pgUrl) {
      return NextResponse.json(
        { error: 'Database not configured. Please set up Postgres.' },
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
    const pgUrl = getPgUrl()
    if (!pgUrl) {
      return NextResponse.json(
        { error: 'Database not configured. Please set up Postgres.' },
        { status: 503 }
      )
    }
    const body = await request.json()
    const { type, title, description, location, template_id } = body
    
    // Validation
    if (!title || !title.trim()) {
      return NextResponse.json(
        { error: 'Title is required' },
        { status: 400 }
      )
    }

    if (!template_id) {
      return NextResponse.json(
        { error: 'Template is required' },
        { status: 400 }
      )
    }
    
    // Get template name from Airtable
    let templateName = null
    try {
      if (template_id) {
        const template = await getTemplateById(template_id)
        if (template && template.name) {
          templateName = template.name
        }
      }
    } catch (error) {
      console.error('Error fetching template name:', error)
      // Continue without template name - not a fatal error
    }
    
    const id = Date.now().toString()
    const status = 'draft' // Start as draft since it's an inspection
    
    // Insert into inspections table (which has template_id support)
    await sql`
      INSERT INTO inspections (
        id, type, title, description, location_label, status, 
        template_id, template_name, created_at, updated_at
      )
      VALUES (
        ${id}, 
        ${type || 'repairs'}, 
        ${title}, 
        ${description || ''}, 
        ${location || ''}, 
        ${status},
        ${template_id},
        ${templateName},
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
    `
    
    // Also insert into issues table for backward compatibility
    await sql`
      INSERT INTO issues (id, type, title, description, location, status)
      VALUES (${id}, ${type || 'repairs'}, ${title}, ${description || ''}, ${location || ''}, ${status})
      ON CONFLICT (id) DO NOTHING
    `
    
    const newIssue = {
      id,
      type: type || 'repairs',
      title,
      description: description || '',
      location: location || '',
      status,
      template_id,
      template_name: templateName,
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
