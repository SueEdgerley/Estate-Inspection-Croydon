import { NextResponse } from 'next/server'
import Airtable from 'airtable'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET - Test Airtable connection
export async function GET() {
  try {
    console.log('[Airtable Test Route] Testing Airtable connection...')

    if (!process.env.AIRTABLE_API_TOKEN && !process.env.AIRTABLE_API_KEY) {
      return NextResponse.json(
        {
          success: false,
          error: 'AIRTABLE_API_TOKEN (or legacy AIRTABLE_API_KEY) is not set',
        },
        { status: 500 }
      )
    }

    if (!process.env.AIRTABLE_BASE_ID) {
      return NextResponse.json(
        {
          success: false,
          error: 'AIRTABLE_BASE_ID is not set',
        },
        { status: 500 }
      )
    }

    const base = new Airtable({
      apiKey: process.env.AIRTABLE_API_TOKEN || process.env.AIRTABLE_API_KEY,
    }).base(process.env.AIRTABLE_BASE_ID)

    console.log('[Airtable Test Route] Fetching records from Templates table...')

    const records = await base('Templates')
      .select({ maxRecords: 5 })
      .firstPage()

    console.log(`[Airtable Test Route] Successfully fetched ${records.length} record(s)`)

    const templates = records.map((r) => {
      const templateName = r.get('template_name') || r.get('Name') || r.get('Template Name') || 'N/A'
      console.log(`[Airtable Test Route] Template: ${r.id} - ${templateName}`)
      console.log(`[Airtable Test Route] Available fields:`, Object.keys(r.fields))

      return {
        id: r.id,
        name: templateName,
        fields: Object.keys(r.fields),
      }
    })

    return NextResponse.json({
      success: true,
      message: 'Airtable connection successful!',
      recordCount: templates.length,
      templates,
    })
  } catch (error) {
    console.error('[Airtable Test Route] Error testing Airtable:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Unknown error',
        details: error.toString(),
        troubleshooting: [
          'Check that AIRTABLE_BASE_ID is set in environment variables',
          'Check that AIRTABLE_API_TOKEN (or legacy AIRTABLE_API_KEY) is set in environment variables',
          'Verify the token has access to the base',
          'Check that the Templates table exists in your Airtable base',
          'Verify the table name matches exactly (case-sensitive)',
          'Check server logs for detailed error information',
        ],
      },
      { status: 500 }
    )
  }
}
