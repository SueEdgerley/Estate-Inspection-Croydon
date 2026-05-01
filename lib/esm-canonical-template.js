import { isEsmInspectionFormTemplate } from '@/lib/esm-inspection-form'

const ESM = 'esm_canonical'

const ESM_SECTIONS = [
  {
    title: '1. Internal Cleaning',
    questions: [
      'Please confirm the overall rating for cleanliness of windows',
      'Please confirm the overall rating for cleanliness of ledges and window sills',
      'Please confirm the overall rating for cleanliness of light fittings and working condition',
      'Please confirm the overall rating for sweeping and washing of stairs, landings, entrance halls and lobbies, and washing down of tiles and painted walls.',
      'Please confirm the overall rating for cobwebs',
      'Please confirm the overall rating for entrance halls and lobbies.',
      'Please confirm the overall rating for handrails, ledges and banister rails',
      'Please confirm the overall rating for cleanliness of walls in communal areas',
    ],
  },
  {
    title: '2. Lifts',
    questions: [
      'Please confirm the overall rating for lift floors',
      'Please confirm the overall rating for lift doors, panels and frames',
    ],
  },
  {
    title: '3. Car Parks',
    questions: ['Please confirm the overall rating for the car park'],
  },
  {
    title: '4. Abandoned Vehicles',
    questions: [
      { text: 'Is there an abandoned vehicle to report?', kind: 'yes_no', esm_q4_abandoned_vehicle: true },
    ],
  },
  {
    title: '5. Garages',
    questions: ['Please confirm the overall rating for garages and garage areas'],
  },
  {
    title: '6. Paths and Hardstandings',
    questions: ['Please confirm the overall rating for paths, roadways and courtyards'],
  },
  {
    title: '7. Play Areas',
    questions: ['Please confirm the overall rating for play areas and seating areas'],
  },
  {
    title: '8. External Cleaning',
    questions: [
      'Please confirm the overall rating for litter removal from communal areas, grassed areas and shrubs',
      'Please confirm the overall rating for graffiti removal',
    ],
  },
  {
    title: '9. Waste Management',
    questions: [
      'Please confirm the overall rating for fly tipping',
      'Please confirm the overall rating for rubbish chutes',
      'Please confirm the overall rating for communal bin shed and drying areas',
      'Please confirm the overall rating for recycling facilities',
      'Please confirm the overall rating for bin chambers',
    ],
  },
  {
    title: '10. Health and Safety',
    questions: [
      'Please confirm the overall rating for security of tank and meter rooms',
      'Please confirm the overall rating for security and tidiness of intake rooms and dry stores',
    ],
  },
  {
    title: '11. Signage and Notice Boards',
    questions: ['Please confirm the overall rating for signage around estates and block notice boards'],
  },
  {
    title: '12. Fire Safety',
    questions: ['Please confirm the overall rating for fire hazards and combustible items'],
  },
  {
    title: '13. Grounds Maintenance',
    questions: [
      'Please confirm the overall rating for grounds maintenance grassed areas',
      'Please confirm the overall rating for grounds maintenance weed clearance',
      'Please confirm the overall rating for grounds maintenance shrub bed and hedge maintenance',
      'Please confirm the overall rating for grounds maintenance tree management',
    ],
  },
]

function slug(input) {
  return String(input || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function normalizeQuestion(question) {
  return typeof question === 'string' ? { text: question, kind: 'graded' } : question
}

function buildQuestion(sectionIndex, question, questionIndex) {
  const def = normalizeQuestion(question)
  const id = `${ESM}_s${sectionIndex + 1}_q${questionIndex + 1}_${slug(def.text).slice(0, 48)}`
  const base = {
    id,
    question_key: id,
    question_text: def.text,
    label: def.text,
    sort_order: questionIndex + 1,
    is_required: false,
    create_action_on_no: false,
    require_comment_on_no: false,
    require_photo_on_no: false,
  }

  if (def.kind === 'yes_no') {
    return {
      ...base,
      question_type: 'yes_no',
      answer_mode: 'yes_no',
      action_trigger_on: 'yes',
      issue_triggers_on: 'yes',
      create_action_on_yes: true,
      create_action_on_no: false,
      action_category: def.esm_q4_abandoned_vehicle ? 'abandoned_vehicle' : undefined,
      category: def.esm_q4_abandoned_vehicle ? 'abandoned_vehicle' : undefined,
      esm_q4_abandoned_vehicle: def.esm_q4_abandoned_vehicle === true,
    }
  }

  if (def.kind === 'single_select') {
    return {
      ...base,
      question_type: 'single_select',
      options: [],
    }
  }

  if (def.kind === 'long_text') {
    return {
      ...base,
      question_type: 'long_text',
    }
  }

  return {
    ...base,
    question_type: 'graded',
    answer_mode: 'graded',
    grading_options: ['A', 'B', 'C', 'D', 'NA'],
    grading_scheme_name: 'A-D/NA',
  }
}

export function replaceWithCanonicalEsmTemplate(template) {
  if (!template || !isEsmInspectionFormTemplate(template)) return template

  const sections = ESM_SECTIONS.map((section, sectionIndex) => ({
    id: `${ESM}_section_${sectionIndex + 1}_${slug(section.title)}`,
    title: section.title,
    name: section.title,
    sort_order: sectionIndex + 1,
    help_text: null,
    what_to_look_for: null,
    is_repeatable: false,
    section_type: 'standard',
    questions: section.questions.map((question, questionIndex) =>
      buildQuestion(sectionIndex, question, questionIndex)
    ),
  }))

  return {
    ...template,
    template_type: template.template_type || 'esm_inspection',
    type: template.type || template.template_type || 'esm_inspection',
    sections,
    questions: sections.flatMap((section) => section.questions),
  }
}

export function applyEsmCanonicalTemplates(templates) {
  if (!Array.isArray(templates)) return templates
  return templates.map((template) => replaceWithCanonicalEsmTemplate(template))
}
