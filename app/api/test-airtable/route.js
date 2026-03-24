import { NextResponse } from 'next/server'
import { testAirtableConnection } from '@/lib/airtable-client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET - Test Airtable connection
export async function GET() {
  try {
    console.log('[Test Route] Testing Airtable connection...')
    
    const result = await testAirtableConnection()
    
    if (result.success) {
      return NextResponse.json({
        success: true,
        message: 'Airtable connection successful!',
        recordCount: result.recordCount,
        records: result.records,
        note: 'Check server logs for detailed field information'
      })
    } else {
      return NextResponse.json({
        success: false,
        error: result.error,
        details: result.details,
        troubleshooting: [
          'Check that AIRTABLE_BASE_ID is set in environment variables',
          'Check that AIRTABLE_API_TOKEN (or legacy AIRTABLE_API_KEY) is set in environment variables',
          'Verify the token has access to the base',
          'Check that the Templates table exists in your Airtable base',
          'Verify the table name matches exactly (case-sensitive)'
        ]
      }, { status: 500 })
    }
  } catch (error) {
    console.error('[Test Route] Error testing Airtable:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to test Airtable connection',
      details: error.message,
      troubleshooting: [
        'Check server logs for detailed error information',
        'Verify environment variables are set correctly',
        'Check network connectivity to Airtable API'
      ]
    }, { status: 500 })
  }
}
