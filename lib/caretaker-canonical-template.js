/**
 * Canonical caretaker template.
 * Applied only to caretaker templates in getTemplatesNested(); other forms are not touched.
 */
import { isCaretakerTemplate } from '@/lib/caretaker-template'

const CM = 'cm_canonical'
const CARETAKER_RECIPIENT_OPTIONS = [
  'Adam Curtis',
  'Kingsey Eze',
  'Stanley Enyinnaya',
  'Mike Thomas',
  'Angela Bradford',
  'Karen Reid',
]

const SECTION_DEFINITIONS = [
  {
    key: 'internal_cleaning',
    title: '1. Internal Cleaning - Cleaning completed for ...',
    questions: [
      'Entrance',
      'Lobby',
      'Doors',
      'Glass',
      'Skirting Boards',
      'Ledges and Window Sills',
      'Lights',
      'Lifts',
      'Handrails and Spindles',
      'Cobwebs',
      'Landings',
      'Refuse Chutes/Bin Chambers',
      { text: 'Other internal cleaning issue (specify in comments)', kind: 'issue_yes_no' },
    ],
  },
  {
    key: 'external_cleaning',
    title: '2. External Cleaning - Cleaning completed for ...',
    questions: [
      'Grass Cutting',
      'Dog Fouling',
      'Graffiti',
      'Fly Tipping',
      'Bins',
      'Potholes',
    ],
  },
  {
    key: 'asb',
    title: '3. ASB',
    questions: [
      { text: 'Is there any ASB to report?', kind: 'issue_yes_no' },
    ],
  },
  {
    key: 'health_and_safety',
    title: '4. Health and Safety',
    questions: [
      { text: 'Are there any health and safety issues?', kind: 'issue_yes_no' },
    ],
  },
  {
    key: 'fire_safety',
    title: '5. Fire Safety',
    questions: [
      { text: 'Are there any fire safety issues?', kind: 'issue_yes_no' },
    ],
  },
]

function qid(secKey, index) {
  return `${CM}_${secKey}_q${index + 1}`
}

function normalizeQuestionDef(question) {
  return typeof question === 'string' ? { text: question, kind: 'yes_no' } : question
}

function buildQuestion(sectionKey, question, index) {
  const def = normalizeQuestionDef(question)
  const issueFollowUpOnYes =
    (sectionKey === 'internal_cleaning' &&
      def.text === 'Other internal cleaning issue (specify in comments)') ||
    sectionKey === 'asb' ||
    sectionKey === 'health_and_safety' ||
    sectionKey === 'fire_safety'
  const recipientOnYes =
    sectionKey === 'asb' ||
    sectionKey === 'health_and_safety' ||
    sectionKey === 'fire_safety'
  const base = {
    id: qid(sectionKey, index),
    question_key: `${sectionKey}_q${index + 1}`,
    question_text: def.text,
    label: def.text,
    is_required: false,
    create_action_on_no: false,
    require_comment_on_no: false,
    require_photo_on_no: false,
  }

  if (def.kind === 'issue_yes_no') {
    return {
      ...base,
      question_type: 'yes_no',
      answer_mode: 'yes_no',
      action_trigger_on: 'yes',
      issue_triggers_on: 'yes',
      create_action_on_yes: true,
      create_action_on_no: false,
      ...(issueFollowUpOnYes
        ? {
            comment_required_when: 'on_yes',
            action_category: sectionKey,
            category: sectionKey,
            ...(recipientOnYes
              ? {
                  caretaker_recipient_on_yes: true,
                  caretaker_recipient_options: CARETAKER_RECIPIENT_OPTIONS,
                }
              : {}),
          }
        : {}),
    }
  }

  if (def.kind === 'photo_comment') {
    return {
      ...base,
      question_type: 'long_text',
      include_photo: true,
      type_includes_photo: true,
    }
  }

  if (def.kind === 'long_text') {
    return {
      ...base,
      question_type: 'long_text',
    }
  }

  if (def.kind === 'text') {
    return {
      ...base,
      question_type: 'text',
    }
  }

  return {
    ...base,
    question_type: 'yes_no',
    answer_mode: 'yes_no',
  }
}

function buildCanonicalSections() {
  return SECTION_DEFINITIONS.map((section, sectionIndex) => ({
    id: `${CM}_${section.key}_section`,
    title: section.title,
    name: section.title,
    sort_order: sectionIndex + 1,
    help_text: null,
    what_to_look_for: null,
    is_repeatable: false,
    section_type: 'standard',
    questions: section.questions.map((question, questionIndex) =>
      buildQuestion(section.key, question, questionIndex)
    ),
  }))
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
