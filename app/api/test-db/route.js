import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { ensureDatabase, getPgUrl } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const pgUrl = getPgUrl()
    if (!pgUrl) {
      return NextResponse.json({
        error: 'Database not configured',
        message: 'Set POSTGRES_URL, POSTGRES_PRISMA_URL, or DATABASE_URL in Vercel environment variables'
      }, { status: 503 })
    }

    // Initialize database (creates tables if they don't exist)
    await ensureDatabase()

    // Test query - get all inspections
    const result = await sql`SELECT * FROM inspections LIMIT 10`

    return NextResponse.json({
      success: true,
      message: 'Database connection successful!',
      connectionString: pgUrl ? 'Set (hidden for security)' : 'Not set',
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
      connectionString: getPgUrl() ? 'Set (hidden for security)' : 'Not set',
      troubleshooting: [
        'Set POSTGRES_URL, POSTGRES_PRISMA_URL, or DATABASE_URL in Vercel environment variables',
        'Verify the connection string is correct (no extra spaces)',
        'Make sure your Neon database is active (not paused)',
        'Check Neon dashboard for connection issues'
      ]
    }, { status: 500 })
  }
}
