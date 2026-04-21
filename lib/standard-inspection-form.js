/**
 * Identifies templates that use the shared "standard inspection" UI (condition + issue rows).
 * Not used for Neighbourhood Voice or walkabout/task-style templates.
 */
import { isCaretakerTemplate } from '@/lib/caretaker-template'

function isNeighbourhoodVoiceTemplate(template) {
  if (!template) return false
  const key = String(template.template_key ?? template['Template Key'] ?? '')
    .toLowerCase()
    .trim()
  const name = String(template.name ?? '')
    .toLowerCase()
    .trim()
  if (key === 'nv' || key === 'neighbourhood_voice' || key === 'neighbourhood voice') return true
  if (name.includes('neighbourhood voice') || name.includes('neighbourhood voices')) return true
  return false
}

function isWalkaboutTemplate(template) {
  if (!template) return false
  const key = String(template.template_key ?? '').toLowerCase()
  const name = String(template.name ?? '').toLowerCase()
  return key.includes('walkabout') || name.includes('walkabout') || key.includes('estate_walkabout')
}

/**
 * The single staff "Estate inspection" Airtable form (graded + comment + photo patch target).
 * Excludes caretaker, NV, walkabout, and other `standard` templates.
 *
 * Optional env (when name/key do not match):
 * - `ESTATE_INSPECTION_TEMPLATE_ID` — Airtable template record id (exact match).
 * - `ESTATE_INSPECTION_TEMPLATE_KEY` — template_key value (exact match, case-insensitive).
 */
export function isEstateInspectionFormTemplate(template) {
  if (!template) return false
  if (isNeighbourhoodVoiceTemplate(template)) return false
  if (isWalkaboutTemplate(template)) return false

  const env = typeof process !== 'undefined' && process.env ? process.env : {}
  const estateId =
    env.ESTATE_INSPECTION_TEMPLATE_ID?.trim?.() ||
    env.NEXT_PUBLIC_ESTATE_INSPECTION_TEMPLATE_ID?.trim?.()
  if (estateId && String(template.id || '').trim() === estateId) return true

  const key = String(template.template_key ?? template['Template Key'] ?? '')
    .toLowerCase()
    .trim()
  const envKey =
    env.ESTATE_INSPECTION_TEMPLATE_KEY?.trim?.().toLowerCase() ||
    env.NEXT_PUBLIC_ESTATE_INSPECTION_TEMPLATE_KEY?.trim?.().toLowerCase()
  if (envKey && key && key === envKey) return true

  if (key === 'estate_inspection' || key === 'estate-inspection' || key.includes('estate_inspection')) {
    return true
  }

  const name = String(template.name ?? '')
    .toLowerCase()
    .trim()
  if (name === 'estate inspection' || name.startsWith('estate inspection ')) return true
  // Match "… estate inspection …" even when `template_type` is `caretaker` (common in Airtable).
  if (/\bestate inspection\b/.test(name) && !name.includes('neighbourhood')) return true
  // Broader: title contains both "estate" and "inspection" (excl. NV / walkabout already filtered).
  if (name.includes('estate') && name.includes('inspection') && !name.includes('neighbourhood')) return true

  if (isCaretakerTemplate(template)) return false

  return false
}

/**
 * Caretaker + typical estate inspection templates from Airtable (`standard` type).
 * Excludes NV and walkabout so their layouts stay independent.
 */
export function usesStandardInspectionFormUI(template) {
  if (!template || isNeighbourhoodVoiceTemplate(template)) return false
  if (isWalkaboutTemplate(template)) return false
  const type = String(template.template_type ?? template.type ?? '').toLowerCase()
  if (isCaretakerTemplate(template)) return true
  if (type === 'standard' || type === 'inspection') return true
  return false
}

/** Condition row: graded A–D–NA with always-visible comment + photo (canonical / caretaker). */
export function questionIsStandardInspectionConditionRow(q) {
  return !!(q && (q.standard_inspection_condition_row || q.caretaker_graded_always_extras))
}

/** Issue row: Yes/No/NA with on-Yes routing extras (canonical / caretaker). */
export function questionIsStandardInspectionIssueRow(q) {
  return !!(q && q.standard_inspection_issue_row)
}
