import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '@/lib/db'
import {
  getOwnRecordViewer,
  loadActionAccessMeta,
  ownRecordActionForbidden,
} from '@/lib/own-record-access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST - Link photos to an action
export async function POST(request, { params }) {
  try {
    const viewer = await getOwnRecordViewer()
    if (viewer.error) return viewer.error

    await ensureDatabase()
    const pgUrl = getPgUrl()
    if (!pgUrl) {
      return NextResponse.json(
        { error: 'Database not configured. Please set up Postgres.' },
        { status: 503 }
      )
    }
    const { id } = await params
    const existing = await loadActionAccessMeta(id)
    if (!existing) {
      return NextResponse.json({ error: 'Action not found' }, { status: 404 })
    }
    const forbidden = ownRecordActionForbidden(viewer, {
      inspectorId: existing.inspector_id,
      recipientPersonId: existing.recipient_person_id,
    })
    if (forbidden) return forbidden

    const { photo_ids } = await request.json()

    if (!Array.isArray(photo_ids) || photo_ids.length === 0) {
      return NextResponse.json(
        { error: 'photo_ids array required' },
        { status: 400 }
      )
    }

    // Link each photo to the action
    const linked = []
    for (const photoId of photo_ids) {
      const linkId = `action_photo_${id}_${photoId}_${Date.now()}`
      
      await sql`
        INSERT INTO action_photos (id, action_id, photo_id)
        VALUES (${linkId}, ${id}, ${photoId})
        ON CONFLICT DO NOTHING
      `
      
      linked.push(linkId)
    }

    return NextResponse.json({
      success: true,
      linked: linked.length,
      photo_ids: linked
    })
  } catch (error) {
    console.error('Error linking photos to action:', error)
    return NextResponse.json(
      { error: 'Failed to link photos', details: error.message },
      { status: 500 }
    )
  }
}
