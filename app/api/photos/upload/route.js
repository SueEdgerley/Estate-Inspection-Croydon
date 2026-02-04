import { NextResponse } from 'next/server'
import { put } from '@vercel/blob'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST - Upload photo to Vercel Blob Storage
export async function POST(request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file')
    const inspectionId = formData.get('inspection_id')
    const questionId = formData.get('question_id')
    
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
