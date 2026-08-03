/**
 * Resolve the site/estate address for the Walkabout Action Plan poster.
 * Reuses the same saved estate/block line as the full inspection report.
 * Returns '' when missing so callers can omit the line (never "undefined"/"null").
 */
export function resolvePosterSiteAddress(inspection) {
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
