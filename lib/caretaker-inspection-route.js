/**
 * Caretakers who land on the older inspection address are sent to their own report.
 * /inspections/new stays on the form.
 */
export function caretakerLegacyInspectionRedirect(pathname, suffix = '') {
  if (typeof pathname !== 'string' || !pathname) return null
  const match = pathname.match(/^\/inspections\/([^/]+)$/)
  if (!match || match[1] === 'new') return null
  return `/caretaker/inspections/${match[1]}${suffix || ''}`
}
