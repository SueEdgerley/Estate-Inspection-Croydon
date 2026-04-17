// Caretaker template specific logic
// Uses template rules engine for validation and action creation

import { 
  isSpecialSection, 
  isTriggerQuestion, 
  isPhotoCommentQuestion, 
  isRecipientQuestion,
  validateTriggerRules,
  getQuestionActionCategory
} from './template-rules'

/**
 * Check if template is caretaker template
 */
export function isCaretakerTemplate(template) {
  const templateType = template.template_type || template.type || ''
  const templateName = (template.name || '').toLowerCase()
  
  return (
    templateType === 'caretaker' ||
    templateName.includes('caretaker')
  )
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
 * Extract recipient information from answers
 * Returns array of person IDs/emails from recipient question
 */
export function extractCaretakerRecipients(answers, questions) {
  const recipientQuestion = findRecipientQuestion(questions)
  
  if (!recipientQuestion) {
    return []
  }
  
  const recipientAnswer = answers[recipientQuestion.id]
  
  if (!recipientAnswer) {
    return []
  }
  
  // Handle single value or array
  if (Array.isArray(recipientAnswer)) {
    return recipientAnswer
  }
  
  return [recipientAnswer]
}
