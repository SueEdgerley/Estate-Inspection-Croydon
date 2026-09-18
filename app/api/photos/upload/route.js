import { NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import { ensureDatabase, getPgUrl } from '@/lib/db'
import {
  getOwnRecordViewer,
  loadInspectionInspectorId,
  ownRecordInspectionForbidden,
} from '@/lib/own-record-access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST - Upload photo to Vercel Blob Storage
export async function POST(request) {
  try {
    const viewer = await getOwnRecordViewer()
    if (viewer.error) return viewer.error

    const formData = await request.formData()
    const file = formData.get('file')
    const inspectionId = formData.get('inspection_id')
    const questionId = formData.get('question_id')

    if (inspectionId) {
      if (getPgUrl()) await ensureDatabase()
      const inspection = await loadInspectionInspectorId(String(inspectionId))
      if (!inspection) {
        return NextResponse.json({ error: 'Inspection not found' }, { status: 404 })
      }
      const forbidden = ownRecordInspectionForbidden(viewer, inspection.inspector_id)
      if (forbidden) return forbidden
    }
    
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      )
    }
    
    // Upload to Vercel Blob
    const blob = await put(`inspections/${inspectionId}/${questionId}/${file.name}`, file, {
      access: 'public',
    })
    
    return NextResponse.json({
      success: true,
      url: blob.url,
      key: blob.pathname
    })
  } catch (error) {
    console.error('Error uploading photo:', error)
    return NextResponse.json(
      { error: 'Failed to upload photo', details: error.message },
      { status: 500 }
    )
  }
}
