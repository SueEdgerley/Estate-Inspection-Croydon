/**
 * Verify Clerk webhooks (Svix). No svix package — follows
 * https://docs.svix.com/receiving/verifying-payloads/how-manual
 */
import crypto from 'crypto'

const TIMESTAMP_TOLERANCE_SEC = 300

/**
 * @param {string} rawBody - Unparsed request body string
 * @param {string} svixId
 * @param {string} svixTimestamp
 * @param {string} svixSignature - full header value
 * @param {string} secret - Clerk signing secret (whsec_…)
 * @returns {boolean}
 */
export function verifyClerkSvixSignature(rawBody, svixId, svixTimestamp, svixSignature, secret) {
  if (!secret || typeof secret !== 'string' || !secret.startsWith('whsec_')) {
    return false
  }
  const ts = Number(svixTimestamp)
  if (!Number.isFinite(ts)) return false
  const now = Math.floor(Date.now() / 1000)
  if (Math.abs(now - ts) > TIMESTAMP_TOLERANCE_SEC) return false

  let secretBytes
  try {
    secretBytes = Buffer.from(secret.slice(6), 'base64')
  } catch {
    return false
  }

  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`
  const expected = crypto.createHmac('sha256', secretBytes).update(signedContent).digest('base64')

  const parts = (svixSignature || '').split(' ')
  for (const part of parts) {
    const comma = part.indexOf(',')
    if (comma === -1) continue
    const version = part.slice(0, comma)
    const sig = part.slice(comma + 1)
    if (version !== 'v1' || !sig) continue
    try {
      const a = Buffer.from(sig, 'base64')
      const b = Buffer.from(expected, 'base64')
      if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true
    } catch {
      /* length mismatch */
    }
  }
  return false
}
