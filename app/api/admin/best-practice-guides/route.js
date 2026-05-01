import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const STATIC_GUIDE = {
  id: 'static-best-practice-guide',
  title: 'Best Practice Guide',
  file_url: '/guides/best-practice-guide.pdf',
  content_type: 'application/pdf',
  active: true,
}

export async function GET() {
  return NextResponse.json([STATIC_GUIDE])
}

export async function POST() {
  return NextResponse.json(
    { error: 'Admin upload is disabled while the app uses the static Best Practice Guide.' },
    { status: 501 }
  )
}
