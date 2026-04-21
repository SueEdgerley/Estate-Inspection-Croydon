/**
 * Synthetic Estate Walkabout template (code-defined, not Airtable).
 * Checklist + action plan — separate from caretaker graded flows and NV.
 */

export const ESTATE_WALKABOUT_TEMPLATE_ID = 'tpl_estate_walkabout_v1'
export const ESTATE_WALKABOUT_CHECKLIST_QID = 'ew_checklist_json'

/** @param {unknown} template */
export function isEstateWalkaboutTemplate(template) {
  if (!template) return false
  if (template.id === ESTATE_WALKABOUT_TEMPLATE_ID) return true
  const key = String(template.template_key ?? template['Template Key'] ?? '')
    .toLowerCase()
    .trim()
  const type = String(template.template_type ?? template.type ?? '')
    .toLowerCase()
    .trim()
  return key === 'estate_walkabout' || type === 'estate_walkabout'
}

/** @param {unknown} templateVersion snapshot or row */
export function isEstateWalkaboutTemplateVersion(templateVersion) {
  if (!templateVersion || typeof templateVersion !== 'object') return false
  const v = templateVersion
  if (v.id === ESTATE_WALKABOUT_TEMPLATE_ID) return true
  const key = String(v.template_key ?? '').toLowerCase().trim()
  const type = String(v.template_type ?? v.type ?? '').toLowerCase().trim()
  return key === 'estate_walkabout' || type === 'estate_walkabout'
}

/**
 * @returns {import('@/lib/airtable-client').TemplateLike}
 */
export function buildEstateWalkaboutTemplate() {
  return {
    id: ESTATE_WALKABOUT_TEMPLATE_ID,
    template_key: 'estate_walkabout',
    name: 'Estate Walkabout',
    template_type: 'estate_walkabout',
    sections: [
      {
        id: 'ew_sec_header',
        title: 'Visit details',
        sort_order: 1,
        help_text: 'Who is leading the walkabout and where.',
        questions: [
          {
            id: 'ew_q_responsible',
            question_key: 'ew_q_responsible',
            question_text: 'Responsible person',
            question_type: 'text',
            is_required: true,
            create_action_on_no: false,
          },
          {
            id: 'ew_q_role',
            question_key: 'ew_q_role',
            question_text: 'Role',
            question_type: 'text',
            is_required: true,
            create_action_on_no: false,
          },
          {
            id: 'ew_q_area',
            question_key: 'ew_q_area',
            question_text: 'Estate / area',
            question_type: 'text',
            is_required: true,
            create_action_on_no: false,
          },
          {
            id: 'ew_q_postcode',
            question_key: 'ew_q_postcode',
            question_text: 'Postcode',
            question_type: 'text',
            is_required: true,
            create_action_on_no: false,
          },
          {
            id: 'ew_q_planned_date',
            question_key: 'ew_q_planned_date',
            question_text: 'Planned date',
            question_type: 'text',
            is_required: true,
            create_action_on_no: false,
          },
        ],
      },
      {
        id: 'ew_sec_ratings',
        title: 'Ratings (A–D)',
        sort_order: 2,
        help_text: 'These ratings are for reporting only — they do not create actions.',
        questions: [
          {
            id: 'ew_r_grounds',
            question_key: 'ew_r_grounds',
            question_text: 'Grounds maintenance',
            question_type: 'walkabout_rating',
            grading_options: ['A', 'B', 'C', 'D'],
            is_required: true,
            create_action_on_no: false,
          },
          {
            id: 'ew_r_paving',
            question_key: 'ew_r_paving',
            question_text: 'Paving & signage',
            question_type: 'walkabout_rating',
            grading_options: ['A', 'B', 'C', 'D'],
            is_required: true,
            create_action_on_no: false,
          },
          {
            id: 'ew_r_communal',
            question_key: 'ew_r_communal',
            question_text: 'Communal repairs',
            question_type: 'walkabout_rating',
            grading_options: ['A', 'B', 'C', 'D'],
            is_required: true,
            create_action_on_no: false,
          },
          {
            id: 'ew_r_internal',
            question_key: 'ew_r_internal',
            question_text: 'Internal cleaning',
            question_type: 'walkabout_rating',
            grading_options: ['A', 'B', 'C', 'D'],
            is_required: true,
            create_action_on_no: false,
          },
          {
            id: 'ew_r_overall',
            question_key: 'ew_r_overall',
            question_text: 'Overall estate standard',
            question_type: 'graded',
            grading_options: ['A', 'B', 'C', 'D'],
            grading_scheme_name: 'A–D',
            is_required: true,
            create_action_on_no: false,
          },
        ],
      },
      {
        id: 'ew_sec_checklist',
        title: 'Checklist & action plan',
        sort_order: 3,
        help_text: 'Add inspection items. Actions are created only when Action Required is checked.',
        questions: [
          {
            id: ESTATE_WALKABOUT_CHECKLIST_QID,
            question_key: 'ew_checklist',
            question_text: 'Inspection items (stored as structured data)',
            question_type: 'long_text',
            is_required: false,
            create_action_on_no: false,
          },
        ],
      },
    ],
  }
}

/**
 * @param {unknown[]} templates
 */
export function appendEstateWalkaboutTemplate(templates) {
  const list = Array.isArray(templates) ? [...templates] : []
  if (!list.some((t) => t && t.id === ESTATE_WALKABOUT_TEMPLATE_ID)) {
    list.push(buildEstateWalkaboutTemplate())
  }
  return list
}
