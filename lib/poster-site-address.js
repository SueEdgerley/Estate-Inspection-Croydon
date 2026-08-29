/**
 * Resolve the site/estate address for the Walkabout Action Plan poster.
 * Reuses the same saved estate/block line as the full inspection report.
 * Returns '' when missing so callers can omit the line (never "undefined"/"null").
 */

import { ESTATE_WALKABOUT_TEMPLATE_ID } from '@/lib/estate-walkabout-template'

/**
 * Guard: address line is Walkabout Action Plan poster only.
 * Matches how submit/list routes already detect Estate Walkabout inspections.
 */
export function isWalkaboutPosterInspection(inspection) {
  if (!inspection || typeof inspection !== 'object') return false
  if (String(inspection.template_id || '').trim() === ESTATE_WALKABOUT_TEMPLATE_ID) return true
  const type = String(inspection.type || inspection.template_type || '').toLowerCase().trim()
  if (type === 'estate_walkabout') return true
  const key = String(inspection.template_key || '').toLowerCase().trim()
  if (key === 'estate_walkabout') return true
  const name = String(inspection.template_name || '').toLowerCase().trim()
  return name === 'estate walkabout' || name.includes('walkabout')
}

export function resolvePosterSiteAddress(inspection) {
  if (!isWalkaboutPosterInspection(inspection)) return ''
  const candidates = [
    inspection?.estate_block_name,
    inspection?.location_line,
    inspection?.location_label,
    inspection?.address,
  ]
  for (const value of candidates) {
    const text = String(value || '').trim()
    if (text && text.toLowerCase() !== 'undefined' && text.toLowerCase() !== 'null') {
      return text
    }
  }
  return ''
}
