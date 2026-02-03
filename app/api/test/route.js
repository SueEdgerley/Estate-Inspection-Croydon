import { NextResponse } from 'next/server'

// Route segment config
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Simple test route to verify API routing is working
export async function GET() {
  return NextResponse.json({ 
    message: 'API routes are working!',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  })
}
