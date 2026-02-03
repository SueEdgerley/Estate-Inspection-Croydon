import { NextResponse } from 'next/server'

// Route segment config
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Health check route - always returns 200
export async function GET() {
  return NextResponse.json({ 
    status: 'ok',
    service: 'Estate Inspection API',
    timestamp: new Date().toISOString()
  }, { status: 200 })
}
