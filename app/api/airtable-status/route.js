import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Returns whether Airtable env vars are set (no secrets). Use to debug "Airtable not configured". */
export async function GET() {
  const baseIdSet = Boolean(process.env.AIRTABLE_BASE_ID?.trim())
  const tokenSet = Boolean(process.env.AIRTABLE_API_TOKEN?.trim())
  const keySet = Boolean(process.env.AIRTABLE_API_KEY?.trim())
  const apiKeySet = tokenSet || keySet
  return NextResponse.json({
    configured: baseIdSet && apiKeySet,
    env: {
      AIRTABLE_BASE_ID: baseIdSet ? 'set' : 'missing',
      AIRTABLE_API_TOKEN: tokenSet ? 'set' : 'missing',
      AIRTABLE_API_KEY: keySet ? 'set' : 'missing',
    },
    hint: !apiKeySet
      ? 'Set AIRTABLE_API_TOKEN or AIRTABLE_API_KEY in Vercel → Settings → Environment Variables (for Production), then Redeploy.'
      : !baseIdSet
        ? 'Set AIRTABLE_BASE_ID in Vercel → Settings → Environment Variables (for Production), then Redeploy.'
        : null,
  })
}
