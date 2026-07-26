/**
 * Report family variant for the shared full-inspection PDF.
 * Presentation only — lightweight detection (no form/data changes).
 */

export const REPORT_VARIANTS = {
  ESM: 'esm',
  WALKABOUT: 'walkabout',
  CARETAKER: 'caretaker',
  DEFAULT: 'default',
}

function norm(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
}

function looksCaretaker(source) {
  if (!source || typeof source !== 'object') return false
  const type = norm(source.template_type || source.type)
  const key = norm(source.template_key || source['Template Key'])
  const name = norm(source.name || source.template_name || source['Name'])
  return (
    type === 'caretaker' ||
    type.includes('caretaker') ||
    key === 'caretaker' ||
    key.includes('caretaker') ||
    name.includes('caretaker')
  )
}

function looksWalkabout(source) {
  if (!source || typeof source !== 'object') return false
  if (source.id === 'tpl_estate_walkabout_v1') return true
  const type = norm(source.template_type || source.type)
  const key = norm(source.template_key || source['Template Key'])
  const name = norm(source.name || source.template_name || source['Name'])
  return (
    key === 'estate_walkabout' ||
    type === 'estate_walkabout' ||
    name === 'estate walkabout' ||
    name.includes('walkabout')
  )
}

function looksEsm(source) {
  if (!source || typeof source !== 'object') return false
  const key = norm(source.template_key || source['Template Key'])
  const name = norm(source.name || source.template_name || source['Name'])
  return (
    key === 'esm_inspection_form' ||
    key === 'esm_inspection' ||
    name === 'esm inspection form' ||
    name === 'esm inspection' ||
    name.includes('esm inspection')
  )
}

/**
 * @param {Record<string, unknown>} inspectionRow
 * @param {Record<string, unknown>|null|undefined} templateVersion
 */
export function resolveInspectionReportVariant(inspectionRow, templateVersion) {
  if (looksCaretaker(inspectionRow) || looksCaretaker(templateVersion)) {
    return REPORT_VARIANTS.CARETAKER
  }
  if (looksWalkabout(templateVersion) || looksWalkabout(inspectionRow)) {
    return REPORT_VARIANTS.WALKABOUT
  }
  if (looksEsm(templateVersion) || looksEsm(inspectionRow)) {
    return REPORT_VARIANTS.ESM
  }
  return REPORT_VARIANTS.DEFAULT
}

/**
 * How the middle column should interpret a question’s answer.
 * @param {Record<string, unknown>|null|undefined} question
 * @param {string} answerVal
 * @param {string} [variant] REPORT_VARIANTS value — Walkabout uses plain Yes/No labels
 */
export function resolvePdfResultMode(question, answerVal = '', variant = '') {
  if (question?.grading_scheme_name) return 'grade'
  const qt = String(question?.question_type || question?.answer_mode || '').toLowerCase()
  if (qt.includes('graded') || qt === 'grade') return 'grade'

  const trigger = String(question?.action_trigger_on || '').toLowerCase()
  const kind = String(question?.kind || '').toLowerCase()
  const answer = String(answerVal || '')
    .trim()
    .toUpperCase()
  const isYnAnswer = answer === 'YES' || answer === 'NO' || answer === 'NA' || answer === 'N/A'
  const isYnType = qt.includes('yes_no') || qt.includes('yesno') || qt === 'yn'
  const isWalkabout = variant === REPORT_VARIANTS.WALKABOUT

  // Walkabout: print Yes / No / N/A — never map No → "Not Completed".
  // Unanswered yes/no questions use a dedicated mode below.
  if (isWalkabout && (isYnType || isYnAnswer || kind === 'issue_yes_no' || trigger === 'yes')) {
    if (!String(answerVal || '').trim() && isYnType) return 'walkabout_unanswered'
    return 'simple_yes_no'
  }

  if (trigger === 'yes' || kind === 'issue_yes_no') return 'issue_yes_no'
  if (isYnType || isYnAnswer) return 'task_yes_no'
  return 'text'
}

export function reportColumnLabels(variant) {
  if (variant === REPORT_VARIANTS.CARETAKER) {
    return {
      question: 'Inspection Item',
      middle: 'Result',
      photo: 'Photo',
    }
  }
  if (variant === REPORT_VARIANTS.WALKABOUT) {
    return {
      question: 'Question / Observation',
      middle: 'Answer',
      photo: 'Photo / Evidence',
    }
  }
  return {
    question: 'Question / Item Inspected',
    middle: 'Rating',
    photo: 'Photo / Evidence',
  }
}

export function reportFamilyTitle(variant, templateName) {
  const name = String(templateName || 'Inspection').trim()
  if (name.toUpperCase().includes('REPORT')) return name.toUpperCase()
  return `${name.toUpperCase()} REPORT`
}
