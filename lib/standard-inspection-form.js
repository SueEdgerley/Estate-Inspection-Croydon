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
