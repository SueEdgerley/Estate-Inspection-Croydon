import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Returns whether Airtable env vars are set (no secrets). Use to debug "Airtable not configured". */
export async function GET() {
  const baseIdSet = Boolean(process.env.AIRTABLE_BASE_ID?.trim())
  const tokenSet = Boolean(process.env.AIRTABLE_API_TOKEN?.trim())
  const keySet = Boolean(process.env.AIRTABLE_API_KEY?.trim())
  const plainTokenSet = Boolean(process.env.AIRTABLE_TOKEN?.trim())
  const apiKeySet = tokenSet || keySet || plainTokenSet

  // Show ALL env keys that contain "AIRTABLE" (so user can see exact names the server sees)
  const airtableEnvKeys = Object.keys(process.env || {}).filter((k) =>
    k.toUpperCase().includes('AIRTABLE')
  )

  const noVarsAtAll = airtableEnvKeys.length === 0
  return NextResponse.json({
    configured: baseIdSet && apiKeySet,
    env: {
      AIRTABLE_BASE_ID: baseIdSet ? 'set' : 'missing',
      AIRTABLE_API_TOKEN: tokenSet ? 'set' : 'missing',
      AIRTABLE_API_KEY: keySet ? 'set' : 'missing',
      AIRTABLE_TOKEN: plainTokenSet ? 'set' : 'missing',
    },
    allAirtableEnvKeys: airtableEnvKeys,
    hint: !apiKeySet
      ? 'Set AIRTABLE_API_TOKEN or AIRTABLE_API_KEY in Vercel → Settings → Environment Variables (for Production), then Redeploy.'
      : !baseIdSet
        ? 'Set AIRTABLE_BASE_ID in Vercel → Settings → Environment Variables (for Production), then Redeploy.'
        : null,
    checklist: noVarsAtAll
      ? [
          '1. You are on the PRODUCTION URL (e.g. your-app.vercel.app), not a Preview URL.',
          '2. In Vercel → Project → Settings → Environment Variables, AIRTABLE_BASE_ID and AIRTABLE_API_KEY exist.',
          '3. For each variable, "Production" is checked under Environments.',
          '4. After saving, go to Deployments → open the latest Production deployment → ⋮ → Redeploy.',
        ]
      : null,
  })
}
