// PDF generation utility – Estate Walkabout Poster
// Generates poster PDF when inspection is submitted
// Uses actions with photo_urls from each action

import { generatePosterPdf } from './poster-pdf'

export async function generatePDF(inspection, answers, actions = []) {
  let actionsToUse = actions

  if (!actionsToUse || actionsToUse.length === 0) {
    try {
      const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
      const actionsResponse = await fetch(`${baseUrl}/api/actions?inspection_id=${inspection.id}`)
      actionsToUse = actionsResponse.ok ? await actionsResponse.json() : []
    } catch (fetchErr) {
      console.warn('[PDF] Could not fetch actions, using empty:', fetchErr.message)
      actionsToUse = []
    }
  }

  return generatePosterPdf(inspection, actionsToUse)
}
