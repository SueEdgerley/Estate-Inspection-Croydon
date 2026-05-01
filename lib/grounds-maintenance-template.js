/**
 * Canonical Grounds Maintenance inspection template (code-defined).
 * Replaces the Airtable-driven structure when the template name/key matches — removes Fly Tipping
 * and any other legacy sections in favour of the five sections below.
 */

export const GROUNDS_MAINTENANCE_TEMPLATE_ID = 'tpl_grounds_maintenance_v1'

const HOUSEMARK = {
  grading_options: ['A', 'B', 'C', 'D', 'NA'],
  grading_scheme_name: 'HouseMark',
}

/** @param {string} name @param {string} [templateKey] */
export function isGroundsMaintenanceTemplateName(name, templateKey) {
  const n = String(name || '').toLowerCase().trim()
  const k = String(templateKey ?? '').toLowerCase().trim()
  if (k === 'grounds_maintenance' || k === 'grounds-maintenance' || k === 'grounds_maintenance_form') return true
  if (n.includes('grounds maintenance') && !n.includes('neighbourhood')) return true
  return false
}

/** @param {unknown} template */
export function isGroundsMaintenanceTemplate(template) {
  if (!template || typeof template !== 'object') return false
  if (template.id === GROUNDS_MAINTENANCE_TEMPLATE_ID) return true
  return isGroundsMaintenanceTemplateName(
    template.name,
    template.template_key ?? template['Template Key']
  )
}

function gradedQ(id, questionText, sortOrder) {
  return {
    id,
    question_key: id,
    question_text: questionText,
    question_type: 'graded',
    answer_mode: 'graded',
    is_required: true,
    create_action_on_no: false,
    sort_order: sortOrder,
    ...HOUSEMARK,
  }
}

function ynQ(id, questionText, sortOrder, triggerOn = 'yes') {
  const yesTrigger = triggerOn === 'yes'
  return {
    id,
    question_key: id,
    question_text: questionText,
    question_type: 'yes_no',
    answer_mode: 'yes_no',
    is_required: true,
    action_trigger_on: yesTrigger ? 'yes' : 'no',
    issue_triggers_on: yesTrigger ? 'yes' : 'no',
    create_action_on_yes: yesTrigger,
    create_action_on_no: !yesTrigger,
    comment_required_when: yesTrigger ? 'on_yes' : 'on_no',
    photo_required_when: yesTrigger ? 'on_yes' : 'on_no',
    action_category: 'grounds',
    category: 'grounds',
    sort_order: sortOrder,
  }
}

const YN_FOLLOW_UP = 'Are there any issues to report for this area?'

/**
 * @param {string | null} [preserveAirtableId] When replacing an Airtable row, pass its id.
 * @returns {import('@/lib/airtable-client').TemplateLike}
 */
export function buildGroundsMaintenanceTemplate(preserveAirtableId = null) {
  return {
    id: preserveAirtableId || GROUNDS_MAINTENANCE_TEMPLATE_ID,
    template_key: 'grounds_maintenance',
    name: 'Grounds Maintenance',
    template_type: 'standard',
    type: 'standard',
    sections: [
      {
        id: 'gm_sec_1_grassed',
        title: 'Section 1: Grounds Maintenance – Grassed Areas',
        name: 'Section 1: Grounds Maintenance – Grassed Areas',
        sort_order: 1,
        help_text: '',
        questions: [
          gradedQ(
            'gm_s1_q1',
            'Please confirm the overall rating for grounds maintenance grassed areas',
            1
          ),
          ynQ('gm_s1_q2', YN_FOLLOW_UP, 2),
        ],
      },
      {
        id: 'gm_sec_2_shrub_hedge',
        title: 'Section 2: Grounds Maintenance - Shrub Bed and Hedge Maintenance',
        name: 'Section 2: Grounds Maintenance - Shrub Bed and Hedge Maintenance',
        sort_order: 2,
        help_text: '',
        questions: [
          gradedQ(
            'gm_s2_q1',
            'Please confirm the overall rating for grounds maintenance shrub bed and hedge maintenance',
            1
          ),
          ynQ('gm_s2_q2', YN_FOLLOW_UP, 2),
        ],
      },
      {
        id: 'gm_sec_3_litter',
        title: 'Section 3: Litter Removal from Communal Areas, Grassed Areas and Shrubs',
        name: 'Section 3: Litter Removal from Communal Areas, Grassed Areas and Shrubs',
        sort_order: 3,
        help_text: '',
        questions: [
          ynQ(
            'gm_s3_q1',
            'Please confirm whether litter removal from communal areas, grassed areas and shrubs is satisfactory',
            1
          ),
        ],
      },
      {
        id: 'gm_sec_4_weed',
        title: 'Section 4: Grounds Maintenance – Weed Clearance',
        name: 'Section 4: Grounds Maintenance – Weed Clearance',
        sort_order: 4,
        help_text: '',
        questions: [
          gradedQ(
            'gm_s4_q1',
            'Please confirm the overall rating for grounds maintenance weed clearance from shrub beds (not hard standings areas/pathways)',
            1
          ),
          ynQ('gm_s4_q2', YN_FOLLOW_UP, 2),
        ],
      },
      {
        id: 'gm_sec_6_trees',
        title: 'Section 5: Grounds Maintenance - Tree Management',
        name: 'Section 5: Grounds Maintenance - Tree Management',
        sort_order: 5,
        help_text: '',
        questions: [
          gradedQ(
            'gm_s6_q1',
            'Please confirm the overall rating for grounds maintenance tree management',
            1
          ),
        ],
      },
    ],
  }
}

/**
 * Replaces any Airtable "Grounds Maintenance" template with the canonical structure (same record id).
 * If none exists, appends the synthetic template so the form is still available.
 * @param {unknown[]} templates
 */
export function applyGroundsMaintenanceTemplateStructure(templates) {
  const list = Array.isArray(templates) ? [...templates] : []
  const idx = list.findIndex((t) =>
    isGroundsMaintenanceTemplateName(t?.name, t?.template_key ?? t?.['Template Key'])
  )
  if (idx === -1) {
    list.push(buildGroundsMaintenanceTemplate())
    return list
  }
  const existing = list[idx]
  list[idx] = buildGroundsMaintenanceTemplate(existing.id)
  return list
}

/**
 * Normalise a stored inspection `template_version` JSON to the canonical Grounds Maintenance structure.
 * @param {unknown} templateVersion
 */
export function applyGroundsMaintenanceTemplateToSnapshot(templateVersion) {
  if (!templateVersion || typeof templateVersion !== 'object') return templateVersion
  if (!isGroundsMaintenanceTemplate(templateVersion)) return templateVersion
  const canonical = buildGroundsMaintenanceTemplate(templateVersion.id)
  return {
    ...templateVersion,
    sections: canonical.sections,
    name: canonical.name,
    template_key: canonical.template_key,
    template_type: canonical.template_type,
    type: canonical.type,
  }
}
