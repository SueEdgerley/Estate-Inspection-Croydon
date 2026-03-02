import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '@/lib/db'

// Route segment config
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET - Fetch a single issue by ID
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
      WHERE id = ${id}
    `
    
    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Issue not found' },
        { status: 404 }
      )
    }
    
    return NextResponse.json(result.rows[0])
  } catch (error) {
    console.error('Error fetching issue:', error)
    return NextResponse.json(
      { error: 'Failed to fetch issue' },
      { status: 500 }
    )
  }
}

// PUT - Update an issue
export async function PUT(request, { params }) {
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
    const body = await request.json()
    
    const updates = {}
    if (body.type !== undefined) updates.type = body.type
    if (body.title !== undefined) updates.title = body.title
    if (body.description !== undefined) updates.description = body.description
    if (body.location !== undefined) updates.location = body.location
    if (body.status !== undefined) updates.status = body.status
    
    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      )
    }
    
    // Build and execute update query
    if (updates.type) {
      await sql`UPDATE issues SET type = ${updates.type} WHERE id = ${id}`
    }
    if (updates.title) {
      await sql`UPDATE issues SET title = ${updates.title} WHERE id = ${id}`
    }
    if (updates.description !== undefined) {
      await sql`UPDATE issues SET description = ${updates.description} WHERE id = ${id}`
    }
    if (updates.location !== undefined) {
      await sql`UPDATE issues SET location = ${updates.location} WHERE id = ${id}`
    }
    if (updates.status) {
      await sql`UPDATE issues SET status = ${updates.status} WHERE id = ${id}`
    }
    
    // Fetch updated issue
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
      WHERE id = ${id}
    `
    
    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Issue not found' },
        { status: 404 }
      )
    }
    
    return NextResponse.json(result.rows[0])
  } catch (error) {
    console.error('Error updating issue:', error)
    return NextResponse.json(
      { error: 'Failed to update issue' },
      { status: 500 }
    )
  }
}

// DELETE - Delete an issue
export async function DELETE(request, { params }) {
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
    const result = await sql`
      DELETE FROM issues
      WHERE id = ${id}
      RETURNING id
    `
    
    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Issue not found' },
        { status: 404 }
      )
    }
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting issue:', error)
    return NextResponse.json(
      { error: 'Failed to delete issue' },
      { status: 500 }
    )
  }
}
