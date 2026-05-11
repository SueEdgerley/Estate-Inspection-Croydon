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
  'internalhousingrepairs@croydon.gov.uk',
  'Housingestateservices@croydon.gov.uk',
  'Tenancy.Service@croydon.gov.uk',
  'wasfi.saada@croydon.gov.uk',
]

export const ESM_GARAGE_EMAIL = 'garage.officer@croydon.gov.uk'
export const ESM_TREE_MANAGEMENT_EMAIL = 'robin.boyle@croydon.gov.uk'
export const ESM_IVY_EMAIL = 'layla.egwenu@croydon.gov.uk'
export const ESM_ABANDONED_VEHICLE_AVS_EMAIL = 'AVS.Parking@croydon.gov.uk'
export const ESM_ABANDONED_VEHICLE_HOUSING_EMAIL = 'Housingestateservices@croydon.gov.uk'
export const ESM_HOUSING_ESTATE_SERVICES_EMAIL = 'Housingestateservices@croydon.gov.uk'
const ESM_SECURITY_OF_INTAKE_ROOMS = 'Security of Intake Rooms'
const ESM_STORAGE_AREAS_RATING =
  'Please confirm the overall rating for pram sheds, sheds, storage space, cycle stores and bulk storage areas.'
const ESM_STORAGE_AREAS_SECTION_TITLE = '6. Storage areas'
const ESM_SECTION_DISPLAY_ORDER = [
  ['internal cleaning', 1],
  ['lifts', 2],
  ['car parks', 3],
  ['abandoned vehicles', 4],
  ['garages', 5],
  ['storage areas', 6],
  ['paths and hardstandings', 7],
  ['play areas', 8],
  ['external cleaning', 9],
  ['waste management', 10],
  ['health and safety', 11],
  ['signage and notice boards', 12],
  ['fire safety', 13],
  ['grounds maintenance', 14],
]

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

function getQuestionOrder(question, fallback = 0) {
  const n = Number(question?.sort_order ?? question?.question_order ?? question?.order ?? fallback)
  return Number.isFinite(n) ? n : fallback
}

function setQuestionOrder(question, order) {
  question.sort_order = order
  question.order = order
  question.question_order = order
}

function makeEsmStorageAreasSection() {
  return {
    id: 'esm_storage_areas',
    title: ESM_STORAGE_AREAS_SECTION_TITLE,
    name: ESM_STORAGE_AREAS_SECTION_TITLE,
    sort_order: 6,
    section_order: 6,
    order: 6,
    esm_display_order: 6,
    esm_display_number: 6,
    help_text: null,
    what_to_look_for: null,
    questions: [],
  }
}

function applyEsmSectionDisplayOrder(section) {
  const sectionBlob = normalizeText(`${section?.title || ''} ${section?.name || ''}`)
  const match = ESM_SECTION_DISPLAY_ORDER.find(([needle]) => sectionBlob.includes(needle))
  if (!match) return
  const [, displayOrder] = match
  section.esm_display_order = displayOrder
  section.esm_display_number = displayOrder
}

function getEsmSectionDisplayOrder(section, fallback = 0) {
  const n = Number(section?.esm_display_order ?? section?.section_order ?? section?.sort_order ?? section?.order ?? fallback)
  return Number.isFinite(n) ? n : fallback
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

function isStorageAreasSection(section) {
  const sectionBlob = normalizeText(`${section?.title || ''} ${section?.name || ''}`)
  return sectionBlob.includes('storage areas')
}

function isStorageAreasRatingQuestion(blob) {
  return (
    blob.includes('overall rating') &&
    (blob.includes('storage') ||
      blob.includes('pram sheds') ||
      blob.includes('cycle stores') ||
      blob.includes('bulk storage'))
  )
}

function ensureStorageAreasRatingQuestion(section) {
  if (!isStorageAreasSection(section)) return
  const questions = Array.isArray(section.questions) ? section.questions : []
  const existing = questions.find((q) => isStorageAreasRatingQuestion(questionBlob(q, section)))
  if (existing) {
    existing.question_text = ESM_STORAGE_AREAS_RATING
    existing.label = ESM_STORAGE_AREAS_RATING
    existing.esm_behavior = 'storage_areas_rating'
    forceEsmGradedPhotoQuestion(existing)
    return
  }

  const question = makeEsmGradedQuestion(section, ESM_STORAGE_AREAS_RATING, nextQuestionOrder(questions))
  question.esm_behavior = 'storage_areas_rating'
  section.questions = [...questions, question]
}

function ensureStorageAreasSection(template) {
  const sections = Array.isArray(template?.sections) ? template.sections : []
  if (sections.some(isStorageAreasSection)) return
  sections.push(makeEsmStorageAreasSection())
  template.sections = sections
}

function isExternalCleaningSection(section) {
  const sectionBlob = normalizeText(`${section?.title || ''} ${section?.name || ''}`)
  return sectionBlob.includes('external cleaning')
}

function isExternalCleaningHousingServicesQuestion(blob) {
  return (
    blob.includes('litter removal') &&
    blob.includes('communal areas') &&
    blob.includes('grassed areas') &&
    blob.includes('shrubs')
  )
}

function isExternalCleaningGraffitiRemovalQuestion(blob) {
  return blob.includes('graffiti removal')
}

function isHealthAndSafetySection(section) {
  const sectionBlob = normalizeText(`${section?.title || ''} ${section?.name || ''}`)
  return sectionBlob.includes('health') && sectionBlob.includes('safety')
}

function isFireSafetySection(section) {
  const sectionBlob = normalizeText(`${section?.title || ''} ${section?.name || ''}`)
  return sectionBlob.includes('fire') && sectionBlob.includes('safety')
}

function isMainHealthAndSafetyIssueQuestion(blob) {
  return blob.includes('are there any health and safety issues')
}

function isMeterRoomsQuestion(blob) {
  return blob.includes('meter rooms')
}

function isSecurityOfIntakeRoomsQuestion(blob) {
  return blob.includes('security of intake rooms')
}

function isMainFireSafetyIssueQuestion(blob) {
  return blob.includes('are there any fire safety issues')
}

function isYesNoQuestion(question) {
  const typeText = normalizeText(
    [
      question?.question_type,
      question?.question_type_raw,
      question?.answer_mode,
      question?.type,
      question?.field_type,
    ].filter(Boolean).join(' ')
  )
  return typeText.includes('yes no') || typeText.includes('yesno') || typeText.includes('yes/no')
}

function isHealthAndSafetyIssueQuestion(question, section) {
  if (!isHealthAndSafetySection(section) || !isYesNoQuestion(question)) return false
  const blob = questionBlob(question, section)
  return (
    isMainHealthAndSafetyIssueQuestion(blob) ||
    (blob.includes('issue') &&
      (blob.includes('health and safety') || (blob.includes('health') && blob.includes('safety'))))
  )
}

function isFireSafetyIssueQuestion(question, section) {
  if (!isFireSafetySection(section) || !isYesNoQuestion(question)) return false
  const blob = questionBlob(question, section)
  return (
    isMainFireSafetyIssueQuestion(blob) ||
    (blob.includes('issue') && blob.includes('fire') && blob.includes('safety'))
  )
}

function isEsmYesNoIssueQuestionByText(question) {
  const text = normalizeText(
    [question?.question_text, question?.label, question?.question_key].filter(Boolean).join(' ')
  )
  return (
    text.includes('are there any health and safety issues') ||
    text.includes('are there any fire safety issues') ||
    text.includes('are there any grounds maintenance issues') ||
    (text.includes('are there any') && text.includes('issues'))
  )
}

function isHealthAndSafetyDuplicateFollowUpRow(question) {
  const rowText = normalizeText(
    [
      question?.question_text,
      question?.label,
      question?.resident_wording,
      question?.instructions,
      question?.helper_text,
      question?.question_key,
    ].filter(Boolean).join(' ')
  )
  const typeText = normalizeText(
    [
      question?.question_type,
      question?.question_type_raw,
      question?.answer_mode,
      question?.type,
      question?.field_type,
    ].filter(Boolean).join(' ')
  )
  return (
    rowText.includes('provide a photo') ||
    rowText.includes('add photo') ||
    rowText.includes('photo upload') ||
    rowText.includes('upload photo') ||
    rowText === 'comment' ||
    rowText === 'comments' ||
    rowText.includes('add comment') ||
    rowText.includes('comments') ||
    rowText.includes('who does this need') ||
    typeText === 'photo' ||
    typeText.includes('photo') ||
    typeText.includes('upload')
  )
}

function isExpectedHealthAndSafetyQuestion(blob) {
  return (
    isMeterRoomsQuestion(blob) ||
    isSecurityOfIntakeRoomsQuestion(blob) ||
    isMainHealthAndSafetyIssueQuestion(blob)
  )
}

function reorderHealthAndSafetyQuestions(section) {
  const questions = Array.isArray(section?.questions) ? section.questions : []
  const meter = questions.find((q) => isMeterRoomsQuestion(questionBlob(q, section)))
  const intake = questions.find((q) => isSecurityOfIntakeRoomsQuestion(questionBlob(q, section)))
  const issue = questions.find((q) => isMainHealthAndSafetyIssueQuestion(questionBlob(q, section)))
  if (!meter || !intake || !issue) return

  const ordered = [...questions].sort(
    (a, b) => getQuestionOrder(a, 0) - getQuestionOrder(b, 0) || String(a?.id || '').localeCompare(String(b?.id || ''))
  )
  const withoutMovedRows = ordered.filter((q) => q !== intake && q !== issue)
  const meterIndex = withoutMovedRows.indexOf(meter)
  if (meterIndex === -1) return

  const reordered = [
    ...withoutMovedRows.slice(0, meterIndex + 1),
    intake,
    issue,
    ...withoutMovedRows.slice(meterIndex + 1),
  ]
  reordered.forEach((question, index) => setQuestionOrder(question, index + 1))
  section.questions = reordered
}

function isSignageNoticeBoardsSection(section) {
  const sectionBlob = normalizeText(`${section?.title || ''} ${section?.name || ''}`)
  return sectionBlob.includes('signage') && sectionBlob.includes('notice')
}

function isNoticeboardsRatingQuestion(blob) {
  return blob.includes('overall rating') && (blob.includes('noticeboards') || blob.includes('notice boards'))
}

function isGroundsMaintenanceSection(section) {
  const sectionBlob = normalizeText(`${section?.title || ''} ${section?.name || ''}`)
  return sectionBlob.includes('grounds') && sectionBlob.includes('maintenance')
}

function isHedgeMaintenanceRatingQuestion(blob) {
  return blob.includes('overall rating') && blob.includes('hedge') && blob.includes('maintenance')
}

function forceEsmGradedPhotoQuestion(question) {
  question.question_type = 'graded'
  question.question_type_raw = 'graded'
  question.answer_mode = 'graded'
  question.grading_options = Array.isArray(question.grading_options) && question.grading_options.length
    ? question.grading_options
    : ['A', 'B', 'C', 'D', 'NA']
  question.grading_scheme_name = question.grading_scheme_name || 'Croydon NV Grading – Final'
  question.include_photo = true
  question.type_includes_photo = true
  question.esm_comment_on_photo = true
  question.esm_comment_label = 'Comment'
  question.nv_graded_require_comment_photo = false
  question.nv_graded_require_comment_only = false
}

function clearEsmNoActionTrigger(question) {
  question.create_action_on_no = false
  if (question.action_trigger_on === 'no') question.action_trigger_on = null
  if (question.issue_triggers_on === 'no') question.issue_triggers_on = null
  const triggers = question.triggers_issue_answer ?? question.triggers_issue_answers ?? question.issue_trigger_answers
  if (typeof triggers === 'string') {
    const next = triggers
      .split(/[,\n;|]+/)
      .map((part) => part.trim())
      .filter((part) => part && part.toLowerCase() !== 'no')
    question.triggers_issue_answer = next.length ? next.join(',') : null
  }
}

function configureEsmYesActionQuestion(question, { behavior, category, priority = 'high' }) {
  question.esm_behavior = behavior
  question.triggers_action = true
  question.action_trigger = true
  question.create_action_on_yes = true
  question.create_action_on_no = false
  question.action_trigger_on = 'yes'
  question.issue_triggers_on = 'yes'
  question.triggers_issue_answer = 'Yes'
  question.action_category = category
  question.category = question.category || category
  question.action_priority = question.action_priority || priority
  question.priority = question.priority || priority
}

const ESM_ISSUE_METADATA_FIELDS = [
  'esm_behavior',
  'triggers_action',
  'action_trigger',
  'create_action_on_yes',
  'create_action_on_no',
  'action_trigger_on',
  'issue_triggers_on',
  'triggers_issue_answer',
  'triggers_issue_answers',
  'issue_trigger_answers',
  'action_category',
  'category',
  'action_priority',
  'priority',
  'include_photo',
  'type_includes_photo',
  'esm_comment_always',
  'esm_comment_label',
  'esm_comment_helper',
  'esm_recipient_on_yes',
  'esm_use_people_recipients',
  'esm_recipient_label',
  'action_recipient_required_when',
  'triggers_email',
  'email_routing',
]

function copyMissingEsmIssueMetadata(target, source) {
  if (!target || !source) return
  for (const field of ESM_ISSUE_METADATA_FIELDS) {
    const current = target[field]
    const incoming = source[field]
    if ((current === undefined || current === null || current === '') && incoming !== undefined && incoming !== null && incoming !== '') {
      target[field] = incoming
    }
  }
}

function keepAirtableIssueQuestionAndHideDuplicates(section, matchesIssueQuestion, isGenericGeneratedQuestion) {
  const questions = Array.isArray(section?.questions) ? section.questions : []
  const candidates = questions.filter((question) => matchesIssueQuestion(question, section))
  if (candidates.length < 2) return

  const keeper = candidates.find((question) => !isGenericGeneratedQuestion(questionBlob(question, section))) || candidates[0]
  for (const question of candidates) {
    if (question === keeper) continue
    copyMissingEsmIssueMetadata(keeper, question)
    question.esm_hidden = true
    question.nv_hidden = true
  }
}

export function applyEsmInspectionFormPatch(template) {
  if (!template || !isEsmInspectionFormTemplate(template)) return template
  ensureStorageAreasSection(template)
  const sections = Array.isArray(template.sections) ? template.sections : []

  for (const section of sections) {
    applyEsmSectionDisplayOrder(section)
    ensureSecurityOfIntakeRoomsQuestion(section)
    ensureStorageAreasRatingQuestion(section)
    if (isHealthAndSafetySection(section)) {
      reorderHealthAndSafetyQuestions(section)
    }
    const questions = Array.isArray(section.questions) ? section.questions : []
    keepAirtableIssueQuestionAndHideDuplicates(
      section,
      isHealthAndSafetyIssueQuestion,
      isMainHealthAndSafetyIssueQuestion
    )
    keepAirtableIssueQuestionAndHideDuplicates(
      section,
      isFireSafetyIssueQuestion,
      isMainFireSafetyIssueQuestion
    )
    const seenIssueQuestionKeys = new Set()
    const isHsSection = isHealthAndSafetySection(section)
    const isFsSection = isFireSafetySection(section)
    const isGmSection = isGroundsMaintenanceSection(section)
    
    if (isHsSection || isFsSection || isGmSection) {
      console.log(`[ESM-PATCH] Section: ${section?.title || section?.name}, H&S:${isHsSection}, Fire:${isFsSection}, GM:${isGmSection}`)
      questions.forEach((q, idx) => {
        const isIssueQ = isEsmYesNoIssueQuestionByText(q)
        console.log(`[ESM-PATCH]   Q${idx}: ${q?.question_text} | IsIssueQ:${isIssueQ}`)
      })
    }
    
    for (const question of questions) {
      if (!question) continue
      const blob = questionBlob(question, section)
      const externalCleaningHousingServices =
        isExternalCleaningSection(section) && isExternalCleaningHousingServicesQuestion(blob)
      const externalCleaningGraffitiRemoval =
        isExternalCleaningSection(section) && isExternalCleaningGraffitiRemovalQuestion(blob)
      const healthAndSafetySection = isHealthAndSafetySection(section)
      const fireSafetySection = isFireSafetySection(section)
      const groundsMaintenanceSection = isGroundsMaintenanceSection(section)

      if ((healthAndSafetySection || fireSafetySection || groundsMaintenanceSection) && isEsmYesNoIssueQuestionByText(question)) {
        const issueKey = `${normalizeText(`${section?.title || ''} ${section?.name || ''}`)}::${normalizeText(
          [question?.question_text, question?.label, question?.question_key].filter(Boolean).join(' ')
        )}`
        console.log(`[ESM-PATCH] Checking duplicate: issueKey=${issueKey}, seen=${seenIssueQuestionKeys.has(issueKey)}`)
        if (seenIssueQuestionKeys.has(issueKey)) {
          console.log(`[ESM-PATCH] HIDING DUPLICATE: ${question?.question_text}`)
          question.esm_hidden = true
          question.nv_hidden = true
          continue
        }
        seenIssueQuestionKeys.add(issueKey)
      }

      if (isSignageNoticeBoardsSection(section) && isNoticeboardsRatingQuestion(blob)) {
        question.esm_behavior = 'noticeboards_rating'
        forceEsmGradedPhotoQuestion(question)
      }

      if (groundsMaintenanceSection && isHedgeMaintenanceRatingQuestion(blob)) {
        question.esm_behavior = 'hedge_maintenance_rating'
        forceEsmGradedPhotoQuestion(question)
        clearEsmNoActionTrigger(question)
      }

      if (
        healthAndSafetySection &&
        isHealthAndSafetyDuplicateFollowUpRow(question) &&
        !isExpectedHealthAndSafetyQuestion(blob)
      ) {
        question.esm_hidden = true
        question.nv_hidden = true
        continue
      }

      if (fireSafetySection && isHealthAndSafetyDuplicateFollowUpRow(question) && !isMainFireSafetyIssueQuestion(blob)) {
        question.esm_hidden = true
        question.nv_hidden = true
        continue
      }

      if (groundsMaintenanceSection && isHealthAndSafetyDuplicateFollowUpRow(question)) {
        question.esm_hidden = true
        question.nv_hidden = true
        continue
      }

      if (healthAndSafetySection && isHealthAndSafetyIssueQuestion(question, section)) {
        configureEsmYesActionQuestion(question, {
          behavior: 'health_safety_issue',
          category: 'health_safety',
          priority: 'high',
        })
        question.include_photo = true
        question.type_includes_photo = true
        question.esm_comment_always = true
        question.esm_comment_label = 'Comment'
        question.esm_comment_helper = 'Add health and safety issue details'
        question.esm_recipient_on_yes = true
        question.esm_recipient_label = 'Who does this need to be sent to?'
        question.action_recipient_required_when = null
      }

      if (fireSafetySection && isFireSafetyIssueQuestion(question, section)) {
        configureEsmYesActionQuestion(question, {
          behavior: 'fire_safety_issue',
          category: 'fire_safety',
          priority: 'high',
        })
        question.include_photo = true
        question.type_includes_photo = true
        question.esm_comment_always = true
        question.esm_comment_label = 'Comment'
        question.esm_comment_helper = 'Add fire safety issue details'
        question.esm_recipient_on_yes = true
        question.esm_use_people_recipients = true
        question.esm_recipient_label = 'Who does this need to be sent to?'
        question.action_recipient_required_when = null
      }

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

      if (externalCleaningGraffitiRemoval) {
        question.esm_behavior = 'graffiti_removal'
        question.include_photo = true
        question.type_includes_photo = true
        question.esm_comment_on_photo = true
        question.esm_comment_label = 'Comment'
        question.esm_comment_helper = 'Add graffiti issue/details'
        question.esm_recipient_on_photo = true
        question.esm_recipient_options = ESM_GRAFFITI_RECIPIENT_OPTIONS
        question.esm_recipient_label = 'Email recipient'
        question.esm_recipient_helper = 'Select which team/person this graffiti issue should be sent to.'
        question.esm_email_on_photo_to_selected_recipient = true
        question.triggers_email = true
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

      if (!externalCleaningHousingServices && !externalCleaningGraffitiRemoval && blob.includes('graffiti') && (blob.includes('removal') || blob.includes('remove'))) {
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
        clearEsmNoActionTrigger(question)
        question.include_photo = true
        question.type_includes_photo = true
        question.esm_comment_on_photo = true
        question.esm_comment_label = 'Comment'
        question.esm_comment_helper = 'Add tree management issue/details'
        question.esm_confirmation_message = 'Tree management issue will be sent to Robin Boyle.'
        question.esm_email_on_photo_and_comment = ESM_TREE_MANAGEMENT_EMAIL
        question.esm_email_on_yes = null
        question.triggers_email = true
        question.email_routing = getEmailRouting(question) || ESM_TREE_MANAGEMENT_EMAIL
      }

      if (blob.includes('overall rating') && blob.includes('ivy') && blob.includes('self seeded')) {
        question.esm_behavior = 'ivy_self_seeded'
        clearEsmNoActionTrigger(question)
        question.include_photo = true
        question.type_includes_photo = true
        question.esm_comment_on_photo = true
        question.esm_comment_label = 'Comment'
        question.esm_comment_helper = 'Add ivy/self-seeded plants issue/details'
        question.esm_confirmation_message = 'Ivy/self-seeded plants issue will be sent to Layla Egwenu.'
        question.esm_email_on_photo_and_comment = ESM_IVY_EMAIL
        question.esm_email_on_photo = null
        question.triggers_email = true
        question.email_routing = getEmailRouting(question) || ESM_IVY_EMAIL
      }
    }
  }

  sections.sort(
    (a, b) =>
      getEsmSectionDisplayOrder(a, 0) - getEsmSectionDisplayOrder(b, 0) ||
      String(a?.id || '').localeCompare(String(b?.id || ''))
  )

  return template
}
