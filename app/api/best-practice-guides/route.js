import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const STATIC_GUIDE = {
  id: 'static-best-practice-guide',
  title: 'Best Practice Guide',
  file_url: '/guides/best-practice-guide.pdf',
  content_type: 'application/pdf',
}

export async function GET() {
  return NextResponse.json({ guide: STATIC_GUIDE })
}
