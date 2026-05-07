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

export const ESM_GARAGE_EMAIL = 'garageofficer@croydon.gov.uk'
export const ESM_TREE_MANAGEMENT_EMAIL = 'robin.boyle@croydon.gov.uk'
export const ESM_IVY_EMAIL = 'layla.egwenu@croydon.gov.uk'
export const ESM_ABANDONED_VEHICLE_AVS_EMAIL = 'AVS.Parking@croydon.gov.uk'
export const ESM_ABANDONED_VEHICLE_HOUSING_EMAIL = 'Housingestateservices@croydon.gov.uk'

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

export function applyEsmInspectionFormPatch(template) {
  if (!template || !isEsmInspectionFormTemplate(template)) return template
  const sections = Array.isArray(template.sections) ? template.sections : []

  for (const section of sections) {
    const questions = Array.isArray(section.questions) ? section.questions : []
    for (const question of questions) {
      if (!question) continue
      const blob = questionBlob(question, section)

      if (blob.includes('lift')) {
        question.esm_behavior = 'lifts_comment'
        question.esm_comment_always = true
        question.esm_comment_label = 'Comment'
        question.esm_comment_helper = 'Add block and floor details if relevant.'
      }

      if (blob.includes('abandon') && (blob.includes('car') || blob.includes('vehicle'))) {
        question.esm_behavior = 'abandoned_vehicle'
        question.esm_q4_abandoned_vehicle = true
        question.esm_dual_photo_upload = true
        question.esm_email_on_yes = ESM_ABANDONED_VEHICLE_AVS_EMAIL
        question.esm_email_on_comment_or_issue = ESM_ABANDONED_VEHICLE_HOUSING_EMAIL
        question.triggers_email = true
        question.email_routing = getEmailRouting(question) || ESM_ABANDONED_VEHICLE_AVS_EMAIL
      }

      if (blob.includes('garage')) {
        question.esm_behavior = 'garages'
        question.esm_comment_always = true
        question.esm_comment_label = 'Comment'
        question.esm_email_on_comment_or_issue = ESM_GARAGE_EMAIL
        question.triggers_email = true
        question.email_routing = getEmailRouting(question) || ESM_GARAGE_EMAIL
      }

      if (blob.includes('graffiti') && (blob.includes('removal') || blob.includes('remove'))) {
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
