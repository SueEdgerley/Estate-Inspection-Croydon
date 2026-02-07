import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Returns whether Airtable env vars are set (no secrets). Use to debug "Airtable not configured". */
export async function GET() {
  const baseIdSet = Boolean(process.env.AIRTABLE_BASE_ID?.trim())
  const apiKeySet = Boolean(process.env.AIRTABLE_API_TOKEN?.trim() || process.env.AIRTABLE_API_KEY?.trim())
  return NextResponse.json({
    configured: baseIdSet && apiKeySet,
    AIRTABLE_BASE_ID: baseIdSet ? 'set' : 'missing',
    AIRTABLE_API_KEY: apiKeySet ? 'set' : 'missing',
  })
}
