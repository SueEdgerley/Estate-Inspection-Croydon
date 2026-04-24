/**
 * Synthetic Estate Walkabout template (code-defined, not Airtable).
 * Structured sections + optional additional action-plan rows — separate from caretaker / NV.
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

function q(id, text, type, extra = {}) {
  return {
    id,
    question_key: id,
    question_text: text,
    question_type: type,
    create_action_on_no: false,
    is_required: extra.is_required !== false,
    grading_options: extra.grading_options,
    grading_scheme_name: extra.grading_scheme_name,
  }
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
        help_text: 'Lead officer and location for this walkabout.',
        questions: [
          q('ew_q_responsible', 'Responsible person', 'text'),
          q('ew_q_role', 'Role', 'text'),
          q('ew_q_area', 'Estate / area', 'text'),
          q('ew_q_postcode', 'Postcode', 'text'),
          q('ew_q_planned_date', 'Planned date', 'text'),
        ],
      },
      {
        id: 'ew_sec_staff',
        title: '1. Staff present',
        sort_order: 2,
        questions: [
          q('ew_st_caretaker_present', 'Is there a caretaker present?', 'yes_no'),
          q('ew_st_repairs_officer_present', 'Is there a repairs officer present?', 'yes_no'),
          q(
            'ew_st_repairs_officer_select',
            'What is the name of the repairs officer?',
            'text',
            { is_required: false }
          ),
          q('ew_st_resident_rep_name', 'What is the name of the resident representative?', 'text', {
            is_required: false,
          }),
          q('ew_st_comments', 'Comments', 'long_text', { is_required: false }),
        ],
      },
      {
        id: 'ew_sec_estate_care',
        title: '2. Estate care and communal repairs',
        sort_order: 3,
        questions: [
          q(
            'ew_ec_paving_grade',
            'What is the quality of the paving/potholes and signage? (Croydon NV Grading – Final)',
            'graded',
            {
              grading_options: ['A', 'B', 'C', 'D', 'NA'],
              grading_scheme_name: 'Croydon NV Grading – Final',
            }
          ),
          q('ew_ec_comments', 'Comments', 'long_text', { is_required: false }),
        ],
      },
      {
        id: 'ew_sec_overall',
        title: '3. Overall standards',
        sort_order: 4,
        questions: [
          q(
            'ew_os_overall_grade',
            'What is the overall standard of the estate? (Croydon NV Grading – Final)',
            'graded',
            {
              grading_options: ['A', 'B', 'C', 'D', 'NA'],
              grading_scheme_name: 'Croydon NV Grading – Final',
            }
          ),
          q('ew_os_comments', 'Comments', 'long_text', { is_required: false }),
        ],
      },
      {
        id: 'ew_sec_item_inspections',
        title: '4. Item inspections',
        sort_order: 5,
        questions: [
          q('ew_it_roof_access', 'Is the roof access secure?', 'yes_no'),
          q('ew_it_tank_secure', 'Is the tank room secure?', 'yes_no'),
          q('ew_it_communal_lighting', 'Have you inspected the communal lighting?', 'yes_no'),
          q(
            'ew_it_glazing',
            'Have you inspected the communal glazing and window frames?',
            'yes_no'
          ),
          q('ew_it_refuse_chutes', 'Are the refuse chutes clear?', 'yes_no'),
          q('ew_it_overflows', 'Are there any overflows or leaks?', 'yes_no'),
          q('ew_it_drains', 'Are the drains and gulleys clear?', 'yes_no'),
          q('ew_it_estate_roads', 'Have you inspected the estate roads?', 'yes_no'),
          q(
            'ew_it_grounds',
            'Have you inspected the grass cutting, trees, flower beds and hedges?',
            'yes_no'
          ),
          q('ew_it_abandoned_vehicles', 'Are there any abandoned vehicles?', 'yes_no'),
          q('ew_it_parking', 'Have you inspected the parking/garage areas?', 'yes_no'),
          q('ew_it_sheds', 'Have you inspected the sheds?', 'yes_no'),
          q('ew_it_graffiti', 'Is there any graffiti?', 'yes_no'),
          q('ew_it_signs', 'Have you inspected the estate signs?', 'yes_no'),
          q('ew_it_comments', 'Comments', 'long_text', { is_required: false }),
        ],
      },
      {
        id: 'ew_sec_signature',
        title: '5. Signature and date',
        sort_order: 6,
        questions: [
          q(
            'ew_sig_inspection_date',
            'Please can the housing officer sign to certify this is a true record of the inspection completed today.',
            'text'
          ),
        ],
      },
      {
        id: 'ew_sec_action_plan',
        title: 'Additional items & action plan',
        sort_order: 7,
        help_text: 'Optional. Actions are only created when Action Required is checked.',
        questions: [
          {
            id: ESTATE_WALKABOUT_CHECKLIST_QID,
            question_key: 'ew_checklist',
            question_text: 'Additional inspection items (structured)',
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
