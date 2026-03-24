import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Returns whether Airtable env vars are set (no secrets). Use to debug "Airtable not configured". */
export async function GET() {
  const baseIdSet = Boolean(process.env.AIRTABLE_BASE_ID?.trim())
  const tokenSet = Boolean(process.env.AIRTABLE_API_TOKEN?.trim())
  const keySet = Boolean(process.env.AIRTABLE_API_KEY?.trim())
  const apiKeySet = tokenSet || keySet

  // Show ALL env keys that contain "AIRTABLE" (so user can see exact names the server sees)
  const airtableEnvKeys = Object.keys(process.env || {}).filter((k) =>
    k.toUpperCase().includes('AIRTABLE')
  )

  const noVarsAtAll = airtableEnvKeys.length === 0
  const hint = !apiKeySet
    ? 'Set AIRTABLE_API_TOKEN (recommended) or legacy AIRTABLE_API_KEY in Vercel → Settings → Environment Variables (for Production), then Redeploy.'
    : !baseIdSet
      ? 'Set AIRTABLE_BASE_ID in Vercel → Settings → Environment Variables (for Production), then Redeploy.'
      : null

  // Direct link to Photobook project env vars (paid project – use this one)
  const envVarsUrl = 'https://vercel.com/photobook-73dad537/estate-inspection-croydon/settings/environment-variables'
  const checklist = [
    '1. Use the PHOTOBOOK project (paid), not the trial project. Open: ' + envVarsUrl,
    '2. Add AIRTABLE_BASE_ID and AIRTABLE_API_TOKEN (or legacy AIRTABLE_API_KEY) from your Airtable account.',
    '3. For each variable, tick "Production" (and Preview if you use preview URLs). Save.',
    '4. Deployments → latest Production deployment → ⋮ → Redeploy (env vars apply only after redeploy).',
  ]

  return NextResponse.json({
    configured: baseIdSet && apiKeySet,
    env: {
      AIRTABLE_BASE_ID: baseIdSet ? 'set' : 'missing',
      AIRTABLE_API_TOKEN: tokenSet ? 'set' : 'missing',
      AIRTABLE_API_KEY: keySet ? 'set' : 'missing',
    },
    allAirtableEnvKeys: airtableEnvKeys,
    hint,
    envVarsUrl: noVarsAtAll ? envVarsUrl : undefined,
    checklist: noVarsAtAll ? checklist : null,
  })
}
