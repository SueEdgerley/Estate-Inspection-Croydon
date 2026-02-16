import { NextResponse } from 'next/server'
import { put } from '@vercel/blob'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic']

// POST - Upload photo to Vercel Blob Storage (public)
export async function POST(request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file')

    if (!file || typeof file === 'string') {
      return NextResponse.json(
        { error: 'No file provided. Use multipart/form-data with a field named "file".' },
        { status: 400 }
      )
    }

    const blob = file
    const size = blob.size
    const type = blob.type || ''

    if (!ALLOWED_TYPES.includes(type) && !type.startsWith('image/')) {
      return NextResponse.json(
        { error: 'File must be an image (JPEG, PNG, GIF, WebP, or HEIC).' },
        { status: 400 }
      )
    }

    if (size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File must be 10MB or smaller.' },
        { status: 400 }
      )
    }

    const filename = blob.name || `photo-${Date.now()}.jpg`
    const pathname = `inspections/${Date.now()}-${filename.replace(/[^a-zA-Z0-9.-]/g, '_')}`

    const result = await put(pathname, blob, { access: 'public' })

    return NextResponse.json({ url: result.url })
  } catch (error) {
    console.error('[upload/photo] Error:', error)
    return NextResponse.json(
      { error: 'Failed to upload photo', details: error.message },
      { status: 500 }
    )
  }
}
