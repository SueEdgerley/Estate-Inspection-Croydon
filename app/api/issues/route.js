import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '@/lib/db'

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
    const { type, title, description, location, template_id, template_name } = body
    
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
    
    // Keep template name from request only; no runtime Airtable dependency
    const templateName =
      typeof template_name === 'string' && template_name.trim()
        ? template_name.trim()
        : null
    const templateVersionResult = await sql`
      SELECT id, snapshot
      FROM template_versions
      WHERE template_id = ${template_id}
      ORDER BY created_at DESC
      LIMIT 1
    `
    if (templateVersionResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'No template version found for template_id. Start an inspection from /api/inspections first.' },
        { status: 400 }
      )
    }
    const templateVersionId = templateVersionResult.rows[0].id
    const templateVersionSnapshot = templateVersionResult.rows[0].snapshot
    
    const id = Date.now().toString()
    const status = 'draft' // Start as draft since it's an inspection
    
    // Insert into inspections table (which has template_id support)
    await sql`
      INSERT INTO inspections (
        id, type, title, description, location_label, status, 
        template_id, template_name, template_version_id, template_version, created_at, updated_at
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
        ${templateVersionId},
        ${JSON.stringify(templateVersionSnapshot)}::jsonb,
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
      template_version_id: templateVersionId,
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
