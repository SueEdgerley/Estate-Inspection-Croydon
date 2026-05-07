/**
 * Exact matcher for the new Airtable-authored ESM inspection form.
 * Keep this deliberately narrow so no existing/legacy form is affected.
 */

export function isEsmInspectionFormTemplate(template) {
  if (!template) return false

  const env = typeof process !== 'undefined' && process.env ? process.env : {}
  const configuredId =
    env.ESM_INSPECTION_TEMPLATE_ID?.trim?.() ||
    env.NEXT_PUBLIC_ESM_INSPECTION_TEMPLATE_ID?.trim?.()
  if (configuredId && String(template.id || '').trim() === configuredId) return true

  const key = String(template.template_key ?? template['Template Key'] ?? '')
    .toLowerCase()
    .trim()
  const configuredKey =
    env.ESM_INSPECTION_TEMPLATE_KEY?.trim?.().toLowerCase() ||
    env.NEXT_PUBLIC_ESM_INSPECTION_TEMPLATE_KEY?.trim?.().toLowerCase()
  if (configuredKey && key && key === configuredKey) return true

  if (key === 'esm_inspection_form' || key === 'esm_inspection') return true

  const name = String(template.name ?? template['Name'] ?? '')
    .toLowerCase()
    .trim()
  return name === 'esm inspection form' || name === 'esm inspection'
}

export const ESM_GRAFFITI_RECIPIENT_OPTIONS = [
  'Housingestateservices@croydon.gov.uk',
  'internalhousingrepairs@croydon.gov.uk',
  'wasfi.saada@croydon.gov.uk',
]

export const ESM_GARAGE_EMAIL = 'garage.officer@croydon.gov.uk'
export const ESM_TREE_MANAGEMENT_EMAIL = 'robin.boyle@croydon.gov.uk'
export const ESM_IVY_EMAIL = 'layla.egwenu@croydon.gov.uk'
export const ESM_ABANDONED_VEHICLE_AVS_EMAIL = 'AVS.Parking@croydon.gov.uk'
export const ESM_ABANDONED_VEHICLE_HOUSING_EMAIL = 'Housingestateservices@croydon.gov.uk'
export const ESM_HOUSING_ESTATE_SERVICES_EMAIL = 'Housingestateservices@croydon.gov.uk'
const ESM_SECURITY_OF_INTAKE_ROOMS = 'Security of Intake Rooms'

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function questionBlob(question, section) {
  return normalizeText(
    [
      section?.title,
      section?.name,
      question?.question_text,
      question?.label,
      question?.resident_wording,
      question?.instructions,
      question?.helper_text,
      question?.question_key,
    ]
      .filter(Boolean)
      .join(' ')
  )
}

function hasAnyRecipientOptions(question) {
  return (
    (Array.isArray(question?.esm_recipient_options) && question.esm_recipient_options.length > 0) ||
    (Array.isArray(question?.caretaker_recipient_options) && question.caretaker_recipient_options.length > 0) ||
    (Array.isArray(question?.options) && question.options.length > 0)
  )
}

function getEmailRouting(question) {
  return String(question?.email_routing || question?.email || '').trim()
}

export function getEsmQuestionRole(question) {
  return String(question?.esm_behavior || question?.esm_question_role || '').trim()
}

function nextQuestionOrder(questions) {
  const orders = questions
    .map((q, idx) => Number(q?.sort_order ?? q?.question_order ?? q?.order ?? idx + 1))
    .filter((n) => Number.isFinite(n) && n > 0)
  return orders.length ? Math.max(...orders) + 1 : questions.length + 1
}

function makeEsmGradedQuestion(section, text, order) {
  const sectionId = String(section?.id || 'esm-section')
  const slug = normalizeText(text).replace(/\s+/g, '_') || `question_${order}`
  return {
    id: `${sectionId}_${slug}`,
    question_key: `esm_${slug}`,
    section_id: section?.id,
    question_text: text,
    label: text,
    question_type: 'graded',
    question_type_raw: 'graded',
    answer_mode: 'graded',
    sort_order: order,
    order,
    question_order: order,
    grading_options: ['A', 'B', 'C', 'D', 'NA'],
    grading_scheme_name: 'Croydon NV Grading – Final',
    include_photo: true,
    type_includes_photo: true,
    esm_comment_on_photo: true,
    triggers_issue_answer: 'C,D',
  }
}

function ensureSecurityOfIntakeRoomsQuestion(section) {
  const sectionBlob = normalizeText(`${section?.title || ''} ${section?.name || ''}`)
  if (!sectionBlob.includes('health') || !sectionBlob.includes('safety')) return
  const questions = Array.isArray(section.questions) ? section.questions : []
  const existing = questions.find((q) => normalizeText(`${q?.question_text || ''} ${q?.label || ''}`).includes('security of intake rooms'))
  if (existing) {
    existing.question_type = existing.question_type || 'graded'
    existing.question_type_raw = existing.question_type_raw || 'graded'
    existing.answer_mode = existing.answer_mode || 'graded'
    existing.grading_options = Array.isArray(existing.grading_options) && existing.grading_options.length
      ? existing.grading_options
      : ['A', 'B', 'C', 'D', 'NA']
    existing.grading_scheme_name = existing.grading_scheme_name || 'Croydon NV Grading – Final'
    existing.include_photo = true
    existing.type_includes_photo = true
    existing.esm_comment_on_photo = true
    return
  }
  const order = nextQuestionOrder(questions)
  section.questions = [...questions, makeEsmGradedQuestion(section, ESM_SECURITY_OF_INTAKE_ROOMS, order)]
}

function isExternalCleaningSection(section) {
  const sectionBlob = normalizeText(`${section?.title || ''} ${section?.name || ''}`)
  return sectionBlob.includes('external cleaning')
}

function isExternalCleaningHousingServicesQuestion(blob) {
  return (
    (blob.includes('litter removal') &&
      blob.includes('communal areas') &&
      blob.includes('grassed areas') &&
      blob.includes('shrubs')) ||
    blob.includes('graffiti removal')
  )
}

export function applyEsmInspectionFormPatch(template) {
  if (!template || !isEsmInspectionFormTemplate(template)) return template
  const sections = Array.isArray(template.sections) ? template.sections : []

  for (const section of sections) {
    ensureSecurityOfIntakeRoomsQuestion(section)
    const questions = Array.isArray(section.questions) ? section.questions : []
    for (const question of questions) {
      if (!question) continue
      const blob = questionBlob(question, section)
      const externalCleaningHousingServices =
        isExternalCleaningSection(section) && isExternalCleaningHousingServicesQuestion(blob)

      if (externalCleaningHousingServices) {
        question.esm_behavior = 'external_cleaning_housing_services'
        question.include_photo = true
        question.type_includes_photo = true
        question.esm_comment_on_photo = true
        question.esm_comment_label = 'Comment'
        question.esm_comment_helper = 'Add issue/details'
        question.esm_email_on_photo = ESM_HOUSING_ESTATE_SERVICES_EMAIL
        question.esm_confirmation_message = 'Notification will be sent to Housing Estate Services.'
        question.triggers_email = true
        question.email_routing = getEmailRouting(question) || ESM_HOUSING_ESTATE_SERVICES_EMAIL
        question.esm_recipient_on_yes = false
        question.action_recipient_required_when = null
      }

      if (blob.includes('lift')) {
        question.esm_behavior = 'lifts_comment'
        question.esm_comment_always = true
        question.esm_comment_label = 'Comment'
        question.esm_comment_helper = 'Add block, floor and lift details'
      }

      if (blob.includes('abandon') && (blob.includes('car') || blob.includes('vehicle'))) {
        const isMainAbandonedVehicleQuestion =
          blob.includes('is there') || blob.includes('to report') || blob.includes('abandoned vehicle to report')
        const isStandaloneDetailField =
          blob.includes('authorisation') ||
          blob.includes('authorising officer') ||
          blob.includes('cost code') ||
          blob.includes('location')
        if (isStandaloneDetailField && !isMainAbandonedVehicleQuestion) {
          question.esm_hidden = true
          question.nv_hidden = true
        } else {
          question.esm_behavior = 'abandoned_vehicle'
          question.esm_q4_abandoned_vehicle = true
          question.esm_dual_photo_upload = true
          question.esm_email_on_yes = ESM_ABANDONED_VEHICLE_AVS_EMAIL
          question.esm_email_on_comment_or_issue = ESM_ABANDONED_VEHICLE_HOUSING_EMAIL
          question.triggers_email = true
          question.email_routing = getEmailRouting(question) || ESM_ABANDONED_VEHICLE_AVS_EMAIL
        }
      }

      if (blob.includes('garage')) {
        question.esm_behavior = 'garages'
        question.esm_comment_always = false
        question.esm_comment_on_photo = true
        question.esm_comment_label = 'Comment'
        question.esm_comment_helper = 'Add garage issue/details'
        question.esm_confirmation_message = 'Garage Officer notification will be sent'
        question.esm_email_on_comment_or_issue = ESM_GARAGE_EMAIL
        question.triggers_email = true
        question.email_routing = getEmailRouting(question) || ESM_GARAGE_EMAIL
      }

      if (!externalCleaningHousingServices && blob.includes('graffiti') && (blob.includes('removal') || blob.includes('remove'))) {
        question.esm_behavior = 'graffiti_removal'
        question.esm_recipient_on_yes = true
        question.action_recipient_required_when = question.action_recipient_required_when || 'on_yes'
        if (!hasAnyRecipientOptions(question)) {
          question.esm_recipient_options = ESM_GRAFFITI_RECIPIENT_OPTIONS
        }
      }

      if (blob.includes('drying area')) {
        question.esm_behavior = 'drying_areas'
        question.esm_email_on_yes = getEmailRouting(question)
        question.triggers_email = Boolean(question.esm_email_on_yes)
        if (!question.esm_email_on_yes) {
          question.esm_missing_email_warning =
            'Veolia email address is missing from the ESM template/config, so this notification cannot be sent until it is added.'
        }
      }

      if (blob.includes('tree management') || (blob.includes('tree') && blob.includes('management'))) {
        question.esm_behavior = 'tree_management'
        question.esm_email_on_yes = ESM_TREE_MANAGEMENT_EMAIL
        question.triggers_email = true
        question.email_routing = getEmailRouting(question) || ESM_TREE_MANAGEMENT_EMAIL
      }

      if (blob.includes('overall rating') && blob.includes('ivy') && blob.includes('self seeded')) {
        question.esm_behavior = 'ivy_self_seeded'
        question.include_photo = true
        question.type_includes_photo = true
        question.esm_comment_on_photo = true
        question.esm_email_on_photo = ESM_IVY_EMAIL
      }
    }
  }

  return template
}
