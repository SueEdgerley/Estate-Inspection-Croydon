/**
 * Exact matcher for the new Airtable-authored ESM inspection form.
 * Keep this deliberately narrow so no existing/legacy form is affected.
 */

export function isEsmInspectionFormTemplate(template) {
  if (!template) return false

  const env = typeof process !== 'undefined' && process.env ? process.env : {}
  const configuredId =
    env.ESM_INSPECTION_TEMPLATE_ID?.trim?.() ||
    env.NEXT_PUBLIC_ESM_INSPECTION_TEMPLATE_ID?.trim?.()
  if (configuredId && String(template.id || '').trim() === configuredId) return true

  const key = String(template.template_key ?? template['Template Key'] ?? '')
    .toLowerCase()
    .trim()
  const configuredKey =
    env.ESM_INSPECTION_TEMPLATE_KEY?.trim?.().toLowerCase() ||
    env.NEXT_PUBLIC_ESM_INSPECTION_TEMPLATE_KEY?.trim?.().toLowerCase()
  if (configuredKey && key && key === configuredKey) return true

  if (key === 'esm_inspection_form' || key === 'esm_inspection') return true

  const name = String(template.name ?? template['Name'] ?? '')
    .toLowerCase()
    .trim()
  return name === 'esm inspection form' || name === 'esm inspection'
}
