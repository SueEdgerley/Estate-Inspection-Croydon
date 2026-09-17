/**
 * Inspections-by-form labels for Analytics management reporting.
 * Kept separate from Top Issues so a form name is never treated as an issue theme.
 */

export const ANALYTICS_FORM_LABELS = [
  'Caretaker',
  'ESM',
  'Estate Walkabout',
  'Grounds Maintenance',
  'Neighbourhood Voice',
  'Repairs Inspector',
]

export function analyticsFormLabel({ templateName = '', type = '', workType = '' } = {}) {
  const name = String(templateName || '').trim().toLowerCase()
  const inspectionType = String(type || '').trim().toLowerCase()
  const work = String(workType || '').trim().toLowerCase()
  const blob = `${name} ${inspectionType} ${work}`

  if (blob.includes('neighbourhood voice') || blob.includes('neighbourhood_voice') || inspectionType.includes('neighbourhood')) {
    return 'Neighbourhood Voice'
  }
  if (name.includes('walkabout') || inspectionType === 'estate_walkabout' || work === 'housing_walkabout') {
    return 'Estate Walkabout'
  }
  if (name.includes('grounds')) return 'Grounds Maintenance'
  if (name.includes('caretaker') || work === 'caretaker_scheduled') return 'Caretaker'
  if (name.includes('esm') || work === 'esm_adhoc') return 'ESM'
  if (name.includes('repair') || inspectionType === 'repairs_inspector') return 'Repairs Inspector'

  return String(templateName || type || '').trim() || '(unknown)'
}

export function analyticsFormBucketSql(alias = 'i') {
  return `CASE
    WHEN lower(trim(COALESCE(${alias}.template_name,''))) LIKE '%neighbourhood voice%'
      OR lower(trim(COALESCE(${alias}.type,''))) LIKE '%neighbourhood%' THEN 'Neighbourhood Voice'
    WHEN lower(trim(COALESCE(${alias}.template_name,''))) LIKE '%walkabout%'
      OR lower(trim(COALESCE(${alias}.type,''))) = 'estate_walkabout' THEN 'Estate Walkabout'
    WHEN lower(trim(COALESCE(${alias}.template_name,''))) LIKE '%grounds%' THEN 'Grounds Maintenance'
    WHEN lower(trim(COALESCE(${alias}.template_name,''))) LIKE '%caretaker%' THEN 'Caretaker'
    WHEN lower(trim(COALESCE(${alias}.template_name,''))) LIKE '%esm%' THEN 'ESM'
    WHEN lower(trim(COALESCE(${alias}.template_name,''))) LIKE '%repair%'
      OR lower(trim(COALESCE(${alias}.type,''))) = 'repairs_inspector' THEN 'Repairs Inspector'
    ELSE COALESCE(NULLIF(trim(${alias}.template_name), ''), NULLIF(trim(${alias}.type), ''), '(unknown)')
  END`
}

export function aggregateInspectionsByForm(rows) {
  const totals = new Map()
  for (const row of rows || []) {
    const form = ANALYTICS_FORM_LABELS.includes(row.form)
      ? row.form
      : analyticsFormLabel(row)
    const count = Number(row.inspections ?? row.cnt ?? 0) || 0
    totals.set(form, (totals.get(form) || 0) + count)
  }
  return ANALYTICS_FORM_LABELS.map((form) => ({
    form,
    inspections: totals.get(form) || 0,
  })).concat(
    [...totals.entries()]
      .filter(([form]) => !ANALYTICS_FORM_LABELS.includes(form))
      .map(([form, inspections]) => ({ form, inspections }))
      .sort((a, b) => b.inspections - a.inspections)
  )
}
