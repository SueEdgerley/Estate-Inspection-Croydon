// PDF generation utility – Estate Walkabout Poster
// Generates poster PDF when inspection is submitted
// Uses actions with photo_urls from each action

import { generatePosterPdf } from './poster-pdf'

/** Build app base URL (server-side only, e.g. for PDF links). Not used for client fetch.
 *  If you set NEXT_PUBLIC_APP_URL in Vercel, use your stable domain (e.g. estate-inspection-croydon-ruby.vercel.app), never a random deployment URL. */
function getBaseUrl() {
  let raw = process.env.VERCEL_URL || process.env.NEXT_PUBLIC_APP_URL || ''
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    try {
      const u = new URL(raw)
      raw = u.hostname + (u.port && u.port !== '80' && u.port !== '443' ? `:${u.port}` : '')
    } catch (_) {
      raw = raw.replace(/^https?:\/\//, '').split('/')[0]
    }
  }
  const host = raw.replace(/\.api:?\d*$/i, '').replace(/:443$/i, '').trim()
  if (host) return `https://${host}`
  return 'http://localhost:3000'
}

export async function generatePDF(inspection, answers, actions = []) {
  let actionsToUse = actions

  if (!actionsToUse || actionsToUse.length === 0) {
    try {
      const baseUrl = getBaseUrl()
      const actionsResponse = await fetch(`${baseUrl}/api/actions?inspection_id=${inspection.id}`)
      actionsToUse = actionsResponse.ok ? await actionsResponse.json() : []
    } catch (fetchErr) {
      console.warn('[PDF] Could not fetch actions, using empty:', fetchErr.message)
      actionsToUse = []
    }
  }

  return generatePosterPdf(inspection, actionsToUse)
}
