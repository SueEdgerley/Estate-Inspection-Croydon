// Caretaker template specific logic
// Uses template rules engine for validation and action creation

import {
  isSpecialSection,
  isTriggerQuestion,
  isPhotoCommentQuestion,
  isRecipientQuestion,
  validateTriggerRules,
  getQuestionActionCategory,
} from './template-rules'

/**
 * Check if template is caretaker template
 */
export function isCaretakerTemplate(template) {
  if (!template) return false
  const templateType = String(template.template_type || template.type || '').toLowerCase().trim()
  const templateKey = String(template.template_key || template['Template Key'] || '').toLowerCase().trim()
  const templateName = String(template.name || template['Name'] || '').toLowerCase().trim()
  
  return (
    templateType === 'caretaker' ||
    templateType.includes('caretaker') ||
    templateKey === 'caretaker' ||
    templateKey.includes('caretaker') ||
    templateName.includes('caretaker')
  )
}

/**
 * True when the loaded inspection row is a caretaker-style form (row + optional template_version snapshot).
 */
export function inspectionIsCaretaker(inspection) {
  if (!inspection) return false
  if (
    isCaretakerTemplate({
      name: inspection.template_name,
      template_type: inspection.template_type,
      type: inspection.template_type,
    })
  ) {
    return true
  }
  let v = inspection.template_version
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v)
    } catch {
      v = null
    }
  }
  if (v && typeof v === 'object') {
    return isCaretakerTemplate({
      name: v.template_name || v.name,
      template_type: v.template_type || v.type,
      type: v.type || v.template_type,
    })
  }
  return false
}

/**
 * Find trigger question in a section
 */
export function findTriggerQuestion(questions, section) {
  return questions.find(q => isTriggerQuestion(q, section))
}

/**
 * Find photo+comment question in a section
 */
export function findPhotoCommentQuestion(questions) {
  return questions.find(q => isPhotoCommentQuestion(q))
}

/**
 * Find recipient question in a section
 */
export function findRecipientQuestion(questions) {
  return questions.find(q => isRecipientQuestion(q))
}

/**
 * Check if caretaker trigger is active (for ASB/H&S/Fire sections)
 */
export function isCaretakerTriggerActive(answers, triggerQuestion) {
  if (!triggerQuestion) return false
  
  const triggerAnswer = answers[triggerQuestion.id]
  return triggerAnswer === true || triggerAnswer === 'yes' || triggerAnswer === 'Yes'
}

/**
 * Validate caretaker template requirements
 * For ASB/H&S/Fire sections: when trigger = "Yes", require photo+comment and recipient
 */
export function validateCaretakerTemplate(answers, questions, section) {
  const errors = {}
  
  // Only validate special sections (ASB/H&S/Fire)
  if (!isSpecialSection(section)) {
    return errors
  }
  
  const triggerQuestion = findTriggerQuestion(questions, section)
  if (!triggerQuestion) {
    return errors
  }
  
  const isTriggerYes = isCaretakerTriggerActive(answers, triggerQuestion)
  
  if (isTriggerYes) {
    const photoCommentQuestion = findPhotoCommentQuestion(questions)
    const recipientQuestion = findRecipientQuestion(questions)
    
    // Require comment (separate photo+comment row, or composite on trigger question)
    if (photoCommentQuestion) {
      const photoCommentAnswer = answers[photoCommentQuestion.id]
      if (!photoCommentAnswer || String(photoCommentAnswer).trim() === '') {
        errors[photoCommentQuestion.id] = 'Photo and comments are required when trigger is "Yes"'
      }
    } else {
      const ck = `${triggerQuestion.id}_comment`
      const comment = answers[ck]
      if (!comment || String(comment).trim() === '') {
        errors[ck] = 'Comment is required when trigger is "Yes"'
      }
    }
    
    // Require recipient
    if (recipientQuestion) {
      const recipientAnswer = answers[recipientQuestion.id]
      if (!recipientAnswer || recipientAnswer === '') {
        errors[recipientQuestion.id] = 'Recipient selection is required when trigger is "Yes"'
      }
    }
  }
  
  return errors
}

/**
 * Extract recipient person IDs from every recipient-style question in the template (deduped).
 * @param {Record<string, unknown>} answers
 * @param {unknown[]} questions
 * @returns {string[]}
 */
export function extractCaretakerRecipients(answers, questions) {
  const out = []
  const seen = new Set()
  for (const q of questions || []) {
    if (!q || !isRecipientQuestion(q)) continue
    const recipientAnswer = answers[q.id]
    if (recipientAnswer == null || recipientAnswer === '') continue
    const list = Array.isArray(recipientAnswer) ? recipientAnswer : [recipientAnswer]
    for (const raw of list) {
      const id = String(raw).trim()
      if (!id || seen.has(id)) continue
      seen.add(id)
      out.push(id)
    }
  }
  return out
}
