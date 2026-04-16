import { NextResponse } from 'next/server'
import { verifyClerkSvixSignature } from '@/lib/clerk-webhook-svix'
import { ensureClerkUserProvisioned } from '@/lib/ensure-clerk-user-provisioned'
import { getConnectionString } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function primaryEmailFromClerkUser(data) {
  if (!data || typeof data !== 'object') return null
  const addresses = Array.isArray(data.email_addresses) ? data.email_addresses : []
  const primaryId = data.primary_email_address_id
  const primary = primaryId ? addresses.find((e) => e && e.id === primaryId) : null
  const email = primary?.email_address || addresses[0]?.email_address
  return typeof email === 'string' && email.trim() ? email.trim() : null
}

/**
 * Clerk → Neon: create/update `users` on user.created / user.updated.
 * Configure in Clerk Dashboard → Webhooks → URL: …/api/webhooks/clerk
 * Signing secret → CLERK_WEBHOOK_SECRET (whsec_…)
 */
export async function POST(request) {
  const secret = process.env.CLERK_WEBHOOK_SECRET
  if (!secret) {
    console.warn('[webhooks/clerk] CLERK_WEBHOOK_SECRET not set — webhook disabled')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 })
  }
  if (!getConnectionString()) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  }

  const rawBody = await request.text()
  const svixId = request.headers.get('svix-id')
  const svixTimestamp = request.headers.get('svix-timestamp')
  const svixSignature = request.headers.get('svix-signature')

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: 'Missing Svix headers' }, { status: 400 })
  }

  if (!verifyClerkSvixSignature(rawBody, svixId, svixTimestamp, svixSignature, secret)) {
    console.warn('[webhooks/clerk] Invalid Svix signature')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  let payload
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const type = payload?.type
  if (type === 'user.created' || type === 'user.updated') {
    const data = payload?.data
    const id = typeof data?.id === 'string' ? data.id : null
    const email = primaryEmailFromClerkUser(data)
    if (id) {
      try {
        await ensureClerkUserProvisioned(id, email)
      } catch (e) {
        console.error('[webhooks/clerk] provision failed:', e?.message || e)
        return NextResponse.json({ error: 'Provision failed', details: e?.message }, { status: 500 })
      }
    }
  }

  return NextResponse.json({ received: true })
}
