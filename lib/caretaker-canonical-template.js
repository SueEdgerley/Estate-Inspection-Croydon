/**
 * Canonical caretaker estate inspection template (replaces Airtable tree for matching templates).
 * Applied in getTemplatesNested() so /inspections/new and inspection snapshots use one structure.
 *
 * Sections 1, 3–30: Q1 graded A–D + comment + photo; Q2 Yes/No/NA + on Yes → comment, photo, recipient.
 * Section 2: Abandoned vehicles (see buildAbandonedVehiclesSection).
 */
import { isCaretakerTemplate } from '@/lib/caretaker-template'

const CM = 'cm_canonical'

function qid(secKey, key) {
  return `${CM}_${secKey}_${key}`
}

/** Grading row: always show comment + photo after a grade is chosen (non-NV UI uses caretaker_graded_always_extras). */
function gradedConditionRow(secKey) {
  return {
    id: qid(secKey, 'q1_grade'),
    question_key: `${secKey}_q1_grade`,
    question_text: 'Overall condition (graded)',
    question_type: 'graded',
    answer_mode: 'graded',
    grading_options: ['A', 'B', 'C', 'D'],
    grading_scheme_name: 'A–D',
    is_required: true,
    caretaker_graded_always_extras: true,
    nv_graded_require_comment_photo: true,
    nv_graded_require_comment_only: true,
    comment_required_when: null,
    photo_required_when: null,
  }
}

/** Trigger row: Yes → comment, photo, recipient. */
function yesNoRecipientRow(secKey, label) {
  return {
    id: qid(secKey, 'q2_issue'),
    question_key: `${secKey}_q2_issue`,
    question_text: label,
    question_type: 'yes_no',
    answer_mode: 'yes_no',
    is_required: true,
    comment_required_when: 'on_yes',
    photo_required_when: 'on_yes',
    caretaker_recipient_on_yes: true,
    create_action_on_no: false,
    require_comment_on_no: false,
    require_photo_on_no: false,
  }
}

function buildStandardSection(sectionNumber, secKey, title) {
  return {
    id: qid(secKey, 'section'),
    title,
    name: title,
    sort_order: sectionNumber,
    help_text: null,
    is_repeatable: false,
    section_type: 'standard',
    questions: [
      gradedConditionRow(secKey),
      yesNoRecipientRow(secKey, 'Is there an issue that needs reporting for this area?'),
    ],
  }
}

function buildAbandonedVehiclesSection() {
  const secKey = 'sec2_abandoned'
  return {
    id: qid(secKey, 'section'),
    title: 'Abandoned vehicles',
    name: 'Abandoned vehicles',
    sort_order: 2,
    help_text: 'Report vehicle details, location, cost code, and officer; confirm before routing.',
    is_repeatable: false,
    section_type: 'standard',
    questions: [
      {
        id: qid(secKey, 'q1'),
        question_key: `${secKey}_q1`,
        question_text: 'Abandoned vehicle issue to report?',
        question_type: 'yes_no',
        is_required: true,
        comment_required_when: 'on_yes',
        photo_required_when: 'on_yes',
        caretaker_recipient_on_yes: true,
      },
      {
        id: qid(secKey, 'q2'),
        question_key: `${secKey}_q2`,
        question_text: 'Vehicle details',
        question_type: 'long_text',
        is_required: false,
      },
      {
        id: qid(secKey, 'q3'),
        question_key: `${secKey}_q3`,
        question_text: 'Location',
        question_type: 'long_text',
        is_required: false,
      },
      {
        id: qid(secKey, 'q4'),
        question_key: `${secKey}_q4`,
        question_text: 'Cost code',
        question_type: 'single_select',
        options: ['— Select —', 'General repairs', 'Grounds', 'Parking', 'Other'],
        is_required: false,
      },
      {
        id: qid(secKey, 'q5'),
        question_key: `${secKey}_q5`,
        question_text: 'Officer details',
        question_type: 'text',
        is_required: false,
      },
      {
        id: qid(secKey, 'q6'),
        question_key: `${secKey}_q6`,
        question_text: 'Confirm details are complete',
        question_type: 'yes_no',
        is_required: true,
      },
      {
        id: qid(secKey, 'q7_routing'),
        question_key: `${secKey}_q7_routing`,
        question_text: 'Routing: comment, photo, recipient',
        caretaker_routing_bundle: true,
        question_type: 'text',
        is_required: false,
      },
    ],
  }
}

function buildCanonicalSections() {
  const sections = []
  for (let i = 0; i < 30; i++) {
    const n = i + 1
    if (n === 2) {
      sections.push(buildAbandonedVehiclesSection())
      continue
    }
    const secKey = `sec${n}`
    const title = `Section ${n}`
    sections.push(buildStandardSection(n, secKey, title))
  }
  return sections
}

/**
 * When true, Airtable sections for caretaker templates are replaced entirely.
 * Set CARETAKER_USE_AIRTABLE_TEMPLATE=1 to disable and use Airtable rows (legacy).
 */
export function shouldReplaceCaretakerTemplateWithCanonical() {
  return process.env.CARETAKER_USE_AIRTABLE_TEMPLATE !== '1'
}

/** @param {Record<string, unknown>} template */
export function replaceWithCanonicalCaretakerTemplate(template) {
  if (!template || !isCaretakerTemplate(template)) return template
  if (!shouldReplaceCaretakerTemplateWithCanonical()) return template

  return {
    ...template,
    template_type: template.template_type || 'caretaker',
    sections: buildCanonicalSections(),
  }
}

/**
 * @param {unknown[]} templates
 */
export function applyCaretakerCanonicalTemplates(templates) {
  if (!Array.isArray(templates)) return templates
  return templates.map((t) => replaceWithCanonicalCaretakerTemplate(t))
}
