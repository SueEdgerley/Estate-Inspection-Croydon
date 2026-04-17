/**
 * Single source of truth for Neighbourhood Voice issue metadata (categories, types, roles).
 * Patched onto template questions in applyNeighbourhoodVoiceTemplatePatch — not inferred in UI at render time.
 */

/** @typedef {{ key: string, section_key: string, issue_category: string, issue_type: string, suggested_team_role: string, create_issue_on_c?: boolean, default_priority_d?: string, default_priority_c?: string }} NvGradedMeta */

/** Graded Q1–Q23: issue mapping and optional C-grade review issues. */
export const NV_GRADED_QUESTIONS = /** @type {NvGradedMeta[]} */ ([
  { key: 'Q1', section_key: 'caretaking', issue_category: 'cleaning', issue_type: 'bin_chamber', suggested_team_role: 'Cleaning' },
  { key: 'Q2', section_key: 'caretaking', issue_category: 'cleaning', issue_type: 'entrance_cleanliness', suggested_team_role: 'Cleaning' },
  { key: 'Q3', section_key: 'caretaking', issue_category: 'repairs', issue_type: 'lifts', suggested_team_role: 'Repairs', create_issue_on_c: true, default_priority_d: 'high', default_priority_c: 'medium' },
  { key: 'Q4', section_key: 'caretaking', issue_category: 'cleaning', issue_type: 'stairs_cleanliness', suggested_team_role: 'Cleaning' },
  { key: 'Q5', section_key: 'caretaking', issue_category: 'cleaning', issue_type: 'landings_balconies', suggested_team_role: 'Cleaning' },
  { key: 'Q6', section_key: 'caretaking', issue_category: 'repairs', issue_type: 'walls_paintwork', suggested_team_role: 'Repairs' },
  { key: 'Q7', section_key: 'caretaking', issue_category: 'lighting', issue_type: 'communal_lighting', suggested_team_role: 'Repairs', create_issue_on_c: true, default_priority_d: 'high', default_priority_c: 'medium' },
  { key: 'Q8', section_key: 'caretaking', issue_category: 'repairs', issue_type: 'handrails', suggested_team_role: 'Repairs', create_issue_on_c: true, default_priority_d: 'high', default_priority_c: 'medium' },
  { key: 'Q9', section_key: 'caretaking', issue_category: 'repairs', issue_type: 'window_frames_panels', suggested_team_role: 'Repairs' },
  { key: 'Q10', section_key: 'grounds', issue_category: 'grounds_maintenance', issue_type: 'grassed_areas', suggested_team_role: 'Grounds Maintenance' },
  { key: 'Q11', section_key: 'grounds', issue_category: 'grounds_maintenance', issue_type: 'hard_standing', suggested_team_role: 'Grounds Maintenance' },
  { key: 'Q12', section_key: 'caretaking', issue_category: 'cleaning', issue_type: 'garage_areas', suggested_team_role: 'Cleaning' },
  { key: 'Q13', section_key: 'grounds', issue_category: 'grounds_maintenance', issue_type: 'pathways', suggested_team_role: 'Grounds Maintenance' },
  { key: 'Q14', section_key: 'grounds', issue_category: 'grounds_maintenance', issue_type: 'roads', suggested_team_role: 'Grounds Maintenance' },
  { key: 'Q15', section_key: 'caretaking', issue_category: 'cleaning', issue_type: 'recycling_facilities', suggested_team_role: 'Cleaning' },
  { key: 'Q16', section_key: 'caretaking', issue_category: 'cleaning', issue_type: 'car_parks', suggested_team_role: 'Cleaning' },
  { key: 'Q17', section_key: 'grounds', issue_category: 'grounds_maintenance', issue_type: 'play_areas', suggested_team_role: 'Grounds Maintenance', create_issue_on_c: true, default_priority_d: 'high', default_priority_c: 'medium' },
  { key: 'Q18', section_key: 'grounds', issue_category: 'grounds_maintenance', issue_type: 'grass_cutting', suggested_team_role: 'Grounds Maintenance' },
  { key: 'Q19', section_key: 'grounds', issue_category: 'grounds_maintenance', issue_type: 'shrubs_flower_beds', suggested_team_role: 'Grounds Maintenance' },
  { key: 'Q20', section_key: 'grounds', issue_category: 'grounds_maintenance', issue_type: 'hedges', suggested_team_role: 'Grounds Maintenance' },
  { key: 'Q21', section_key: 'grounds', issue_category: 'grounds_maintenance', issue_type: 'weed_killing', suggested_team_role: 'Grounds Maintenance' },
  { key: 'Q22', section_key: 'window_cleaning', issue_category: 'window_cleaning', issue_type: 'communal_windows', suggested_team_role: 'Cleaning' },
  { key: 'Q23', section_key: 'window_cleaning', issue_category: 'window_cleaning', issue_type: 'communal_doors_panels', suggested_team_role: 'Cleaning' },
])

export const NV_GRADED_BY_KEY = Object.fromEntries(NV_GRADED_QUESTIONS.map((d) => [d.key, d]))

/** Q24 sub-lines: Yes → issue; metadata only from schema. */
export const NV_Q24_SUBISSUES = [
  {
    sub_key: 'abandoned_properties',
    label: 'Empty/Abandoned properties or unauthorised occupants',
    issue_category: 'tenancy_management',
    issue_type: 'empty_or_abandoned_property',
    suggested_team_role: 'Housing Officer',
    ext_yes_no_field: 'issues_abandoned_properties',
    ext_detail_field: 'issues_abandoned_properties_detail',
    default_priority: 'medium',
  },
  {
    sub_key: 'abandoned_vehicles',
    label: 'Abandoned vehicles',
    issue_category: 'parking_abandoned_vehicle',
    issue_type: 'abandoned_vehicle',
    suggested_team_role: 'Housing Officer',
    ext_yes_no_field: 'issues_abandoned_vehicles',
    ext_detail_field: 'issues_abandoned_vehicles_detail',
    default_priority: 'medium',
  },
]

export function getNvGradedMeta(nvKey) {
  if (!nvKey || typeof nvKey !== 'string') return null
  return NV_GRADED_BY_KEY[nvKey] || null
}

/**
 * @param {unknown} version Template snapshot (after patch) or version-like object
 */
export function isNeighbourhoodVoiceTemplateVersion(version) {
  if (!version || typeof version !== 'object') return false
  const key = String(version.template_key ?? version['Template Key'] ?? '')
    .toLowerCase()
    .trim()
  const name = String(version.name ?? '').toLowerCase().trim()
  if (key === 'nv' || key === 'neighbourhood_voice' || key === 'neighbourhood voice') return true
  if (name.includes('neighbourhood voice') || name.includes('neighbourhood voices')) return true
  return false
}
