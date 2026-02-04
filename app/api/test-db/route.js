import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // Check if POSTGRES_URL is set
    if (!process.env.POSTGRES_URL) {
      return NextResponse.json({
        error: 'POSTGRES_URL not set',
        message: 'Please set POSTGRES_URL in your Vercel environment variables'
      }, { status: 503 })
    }

    // Initialize database (creates tables if they don't exist)
    await ensureDatabase()

    // Test query - get all inspections
    const result = await sql`SELECT * FROM inspections LIMIT 10`

    return NextResponse.json({
      success: true,
      message: 'Database connection successful!',
      connectionString: process.env.POSTGRES_URL ? 'Set (hidden for security)' : 'Not set',
      tableExists: true,
      rowCount: result.rows.length,
      sampleData: result.rows,
      note: 'If rowCount is 0, the table exists but is empty (which is normal for a new database)'
    })
  } catch (error) {
    console.error('Database test error:', error)
    return NextResponse.json({
      success: false,
      error: error.message,
      details: error.toString(),
      connectionString: process.env.POSTGRES_URL ? 'Set (hidden for security)' : 'Not set',
      troubleshooting: [
        'Check that POSTGRES_URL is set in Vercel environment variables',
        'Verify the connection string is correct (no extra spaces)',
        'Make sure your Neon database is active (not paused)',
        'Check Neon dashboard for connection issues'
      ]
    }, { status: 500 })
  }
}
