import { isCaretakerTemplate } from '@/lib/caretaker-template'
import { isEstateWalkaboutTemplate } from '@/lib/estate-walkabout-template'
import { isEsmInspectionFormTemplate } from '@/lib/esm-inspection-form'

export const WORK_TYPES = {
  CARETAKER_SCHEDULED: 'caretaker_scheduled',
  ESM_ADHOC: 'esm_adhoc',
  HOUSING_WALKABOUT: 'housing_walkabout',
}

export const WORK_TYPE_VALUES = Object.values(WORK_TYPES)

export function normalizeWorkType(value) {
  const v = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (WORK_TYPE_VALUES.includes(v)) return v
  if (v === 'walkabout' || v === 'estate_walkabout' || v === 'housing_officer_walkabout') {
    return WORK_TYPES.HOUSING_WALKABOUT
  }
  if (v === 'esm' || v === 'ad_hoc' || v === 'adhoc') return WORK_TYPES.ESM_ADHOC
  if (v === 'caretaker' || v === 'scheduled') return WORK_TYPES.CARETAKER_SCHEDULED
  return null
}

export function deriveInspectionWorkType({ template = null, role = '', source = '', explicit = '', isScheduled = false } = {}) {
  const fromExplicit = normalizeWorkType(explicit)
  if (fromExplicit) return fromExplicit

  if (template) {
    if (isEstateWalkaboutTemplate(template)) return WORK_TYPES.HOUSING_WALKABOUT
    if (isEsmInspectionFormTemplate(template)) return WORK_TYPES.ESM_ADHOC
    if (isCaretakerTemplate(template)) return WORK_TYPES.CARETAKER_SCHEDULED
  }

  const roleNorm = String(role || '').toLowerCase().trim().replace(/[\s-]+/g, '_')
  if (roleNorm === 'housing_officer') return WORK_TYPES.HOUSING_WALKABOUT
  if (roleNorm === 'esm') return WORK_TYPES.ESM_ADHOC
  if (roleNorm === 'caretaker') return WORK_TYPES.CARETAKER_SCHEDULED

  const sourceNorm = String(source || '').toLowerCase().trim()
  if (isScheduled || sourceNorm.includes('scheduled')) return WORK_TYPES.CARETAKER_SCHEDULED
  return WORK_TYPES.ESM_ADHOC
}

export function workTypeLabel(workType) {
  switch (normalizeWorkType(workType)) {
    case WORK_TYPES.CARETAKER_SCHEDULED:
      return 'Caretaker Inspection'
    case WORK_TYPES.ESM_ADHOC:
      return 'Grounds Inspection'
    case WORK_TYPES.HOUSING_WALKABOUT:
      return 'Estate Walkabout'
    default:
      return 'Unknown'
  }
}

export function inspectionTypeLabel(value, fallback = 'Inspection') {
  const workType = normalizeWorkType(value)
  if (workType) return workTypeLabel(workType)
  const raw = String(value || '').trim()
  if (!raw) return fallback
  const normalized = raw.toLowerCase().replace(/[\s-]+/g, '_')
  if (normalized.includes('neighbourhood_voice') || normalized === 'resident') return 'Neighbourhood Voice'
  if (normalized.includes('grounds')) return 'Grounds Inspection'
  if (normalized.includes('caretaker')) return 'Caretaker Inspection'
  if (normalized.includes('walkabout') || normalized === 'estate_walkabout') return 'Estate Walkabout'
  if (normalized === 'inspection') return fallback
  return raw.replace(/[_-]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}
