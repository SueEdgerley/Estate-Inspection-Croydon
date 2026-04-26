import { isEstateInspectionFormV2Template } from '@/lib/standard-inspection-form'
import { firstLinkedRecordId } from '@/lib/airtable-linked-record-id'

const INTERNAL_CLEANING_TITLE = 'Internal Cleaning'

const INTERNAL_CLEANING_QUESTIONS = [
  'Please confirm the overall rating for cleanliness of ledges and window sills',
  'Please confirm the overall rating for cleanliness of light fittings and working condition',
  'Please confirm the overall rating for sweeping and washing of stairs, landings, entrance halls and lobbies, and washing down of tiles and painted walls.',
  'Please confirm the overall rating for cobwebs',
  'Please confirm the overall rating for entrance halls and lobbies.',
  'Please confirm the overall rating for handrails, ledges and banister rails',
  'Please confirm the overall rating for cleanliness of walls in communal areas',
]

const DEFAULT_GRADING_OPTIONS = ['A', 'B', 'C', 'D', 'NA']

function normalizeText(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function questionText(q) {
  return [
    q?.question_text,
    q?.label,
    q?.resident_wording,
    q?.instructions,
    q?.helper_text,
  ]
    .filter((x) => x != null && String(x).trim())
    .join(' ')
}

function isInternalCleaningSection(section, index) {
  const blob = normalizeText(`${section?.title || ''} ${section?.name || ''}`)
  if (blob === normalizeText(INTERNAL_CLEANING_TITLE)) return true
  const order = Number(section?.section_order ?? section?.sort_order ?? section?.order ?? 0)
  return order === 1 || index === 0
}

function questionIdFor(section, order) {
  const sid = String(section?.id || 'estate-inspection-v2-section-1')
  return `${sid}_internal_cleaning_${order}`
}

function makeQuestion(section, text, order) {
  return {
    id: questionIdFor(section, order),
    question_key: `estate_v2_internal_cleaning_${order}`,
    section_id: section.id,
    question_text: text,
    label: text,
    question_type: 'graded',
    question_type_raw: 'graded',
    answer_mode: 'graded',
    sort_order: order,
    order,
    question_order: order,
    grading_options: [...DEFAULT_GRADING_OPTIONS],
    grading_scheme_name: null,
    include_photo: true,
    type_includes_photo: true,
    photo_required_when: null,
    comment_required_when: null,
    create_action_on_no: false,
    require_comment_on_no: false,
    require_photo_on_no: false,
    triggers_issue_answer: 'C,D',
  }
}

function normalizeInternalCleaningQuestion(q, section, text, order) {
  q.id = q.id || questionIdFor(section, order)
  q.question_key = q.question_key || `estate_v2_internal_cleaning_${order}`
  q.section_id = q.section_id || section.id
  q.question_text = text
  q.label = text
  q.question_type = 'graded'
  q.question_type_raw = q.question_type_raw || 'graded'
  q.answer_mode = 'graded'
  q.sort_order = order
  q.order = order
  q.question_order = order
  q.grading_options = Array.isArray(q.grading_options) && q.grading_options.length
    ? q.grading_options
    : [...DEFAULT_GRADING_OPTIONS]
  q.include_photo = true
  q.type_includes_photo = true
  q.photo_required_when = q.photo_required_when || null
  q.comment_required_when = q.comment_required_when || null
  q.triggers_issue_answer = q.triggers_issue_answer || 'C,D'
  q.create_action_on_no = false
  q.require_comment_on_no = false
  q.require_photo_on_no = false
  return q
}

function findQuestionByText(questions, text) {
  const target = normalizeText(text)
  return questions.find((q) => normalizeText(questionText(q)) === target)
}

function questionSectionId(q) {
  if (!q || typeof q !== 'object') return null
  const direct = q.section_id ?? q.sectionId
  if (direct != null && String(direct).trim() !== '') return String(direct).trim()
  return firstLinkedRecordId(q.Section ?? q.section)
}

/**
 * Estate Inspection v2 is authored in Airtable. This patch only guards the known
 * Section 1 payload so the app renders Airtable's intended checklist rows rather
 * than falling back to legacy estate inspection rows.
 *
 * @param {Record<string, unknown>} template
 */
export function applyEstateInspectionV2TemplatePatch(template) {
  if (!template || !isEstateInspectionFormV2Template(template)) return template
  if (!Array.isArray(template.sections) || template.sections.length === 0) return template

  const section = template.sections.find(isInternalCleaningSection)
  if (!section) return template

  section.title = INTERNAL_CLEANING_TITLE
  section.name = INTERNAL_CLEANING_TITLE
  section.sort_order = Number(section.sort_order ?? section.section_order ?? section.order ?? 1) || 1

  const existing = Array.isArray(section.questions) ? section.questions : []
  const nextQuestions = INTERNAL_CLEANING_QUESTIONS.map((text, idx) => {
    const order = idx + 1
    const found = findQuestionByText(existing, text)
    return normalizeInternalCleaningQuestion(found || makeQuestion(section, text, order), section, text, order)
  })

  section.questions = nextQuestions

  if (Array.isArray(template.questions)) {
    const sectionId = String(section.id)
    const replacementIds = new Set(nextQuestions.map((q) => String(q.id)))
    const withoutInternalCleaning = template.questions.filter((q) => {
      if (replacementIds.has(String(q?.id))) return false
      return String(questionSectionId(q) || '') !== sectionId
    })
    template.questions = [...withoutInternalCleaning, ...nextQuestions].sort((a, b) => {
      const sa = Number(a?.section_order ?? a?.section_sort_order ?? 0)
      const sb = Number(b?.section_order ?? b?.section_sort_order ?? 0)
      if (sa !== sb) return sa - sb
      return (Number(a?.sort_order ?? a?.order ?? 0) || 0) - (Number(b?.sort_order ?? b?.order ?? 0) || 0)
    })
  }

  return template
}
