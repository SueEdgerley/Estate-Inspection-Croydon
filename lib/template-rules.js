// Template rules engine
// Handles caretaker template logic and ASB/H&S/Fire section rules

import { getEffectiveQuestionKind, normalizeQuestionType } from './question-types'

function isYesNoQuestionType(question) {
  const qt = normalizeQuestionType(question.question_type || question.answer_mode || '')
  return qt === 'yes_no'
}

/**
 * Check if a section is an ASB/Health&Safety/Fire section
 */
export function isSpecialSection(section) {
  const sectionType = section.section_type || section.type || ''
  const sectionName = (section.name || '').toLowerCase()
  
  return (
    sectionType === 'asb' ||
    sectionType === 'health_safety' ||
    sectionType === 'fire_safety' ||
    sectionName.includes('asb') ||
    sectionName.includes('anti-social') ||
    sectionName.includes('health') ||
    sectionName.includes('safety') ||
    sectionName.includes('fire')
  )
}

/**
 * Get action category for a special section
 */
export function getSectionActionCategory(section) {
  const sectionType = section.section_type || section.type || ''
  const sectionName = (section.name || '').toLowerCase()
  
  if (sectionType === 'asb' || sectionName.includes('asb') || sectionName.includes('anti-social')) {
    return 'asb'
  }
  if (sectionType === 'health_safety' || sectionName.includes('health') || sectionName.includes('safety')) {
    return 'health_safety'
  }
  if (sectionType === 'fire_safety' || sectionName.includes('fire')) {
    return 'fire_safety'
  }
  
  return null
}

/**
 * Check if question is a trigger question for ASB/H&S/Fire sections
 * Trigger questions are Yes/No questions that reveal photo+comment+recipient when "Yes"
 */
export function isTriggerQuestion(question, section) {
  if (!isSpecialSection(section)) {
    return false
  }
  
  // Check if question is marked as trigger or has trigger-like behavior
  const questionText = String(question.label || question.question_text || '').toLowerCase()
  const qt = normalizeQuestionType(question.question_type || question.answer_mode || '')
  const isYesNo = qt === 'yes_no'
  
  // Common trigger question patterns
  const triggerPatterns = [
    'issue',
    'concern',
    'problem',
    'incident',
    'report',
    'trigger'
  ]
  
  return isYesNo && (
    question.is_trigger === true ||
    triggerPatterns.some(pattern => questionText.includes(pattern))
  )
}

/**
 * Get required questions when trigger is "Yes" in ASB/H&S/Fire sections
 */
export function getTriggerRequiredQuestions(section) {
  if (!isSpecialSection(section)) {
    return []
  }
  
  // When trigger is "Yes", require:
  // 1. Photo + Comments question
  // 2. Recipient selector (Who to send to?)
  return [
    { type: 'photo_comment', required: true },
    { type: 'recipient', required: true }
  ]
}

/**
 * Check if question is a photo+comment question
 */
export function isPhotoCommentQuestion(question) {
  const questionText = String(question.label || question.question_text || '').toLowerCase()
  const qt = normalizeQuestionType(question.question_type || question.answer_mode || '')
  return (
    qt === 'photo' ||
    (questionText.includes('photo') && questionText.includes('comment'))
  )
}

/**
 * Check if question is a recipient selector (dropdown filled from Postgres issue_recipient people).
 * Uses effective question kind so `select` / `single_select` both match; wording may live on label or question_text.
 */
export function isRecipientQuestion(question) {
  if (!question) return false
  const kind = getEffectiveQuestionKind(question)
  if (kind !== 'single_select' && kind !== 'select') return false
  if (question.id === 'who_to_send_to') return true
  const questionText = String(question.label || question.question_text || '').toLowerCase()
  return (
    questionText.includes('who to send') ||
    questionText.includes('who does this') ||
    questionText.includes('recipient') ||
    questionText.includes('send to') ||
    questionText.includes('sent to')
  )
}

/**
 * Validate caretaker template rules
 * - Yes/No cleaning questions: require comment + photo when "No"
 */
export function validateCaretakerQuestion(question, answer, comment, photos) {
  const errors = {}
  
  // Only validate Yes/No questions
  if (!isYesNoQuestionType(question)) {
    return errors
  }
  
  const isNo = answer === false || answer === 'no' || answer === 'No'
  
  // If "No" and action should be created
  if (isNo && question.create_action_on_no !== false) {
    // Check comment requirement
    if (question.require_comment_on_no !== false) {
      if (!comment || comment.trim() === '') {
        errors[`${question.id}_comment`] = 'Comment is required when answering "No"'
      }
    }
    
    // Check photo requirement
    if (question.require_photo_on_no !== false) {
      if (!photos || photos.length === 0) {
        errors[`${question.id}_photos`] = 'At least one photo is required when answering "No"'
      }
    }
  }
  
  return errors
}

/**
 * Validate ASB/H&S/Fire trigger rules
 * - When trigger = "Yes": require photo+comment and recipient
 */
export function validateTriggerRules(section, triggerAnswer, photoCommentAnswer, recipientAnswer) {
  const errors = {}
  
  if (!isSpecialSection(section)) {
    return errors
  }
  
  const isTriggerYes = triggerAnswer === true || triggerAnswer === 'yes' || triggerAnswer === 'Yes'
  
  if (isTriggerYes) {
    // Require photo+comment
    if (!photoCommentAnswer || photoCommentAnswer.trim() === '') {
      errors.photo_comment = 'Photo and comments are required when trigger is "Yes"'
    }
    
    // Require recipient
    if (!recipientAnswer || recipientAnswer === '') {
      errors.recipient = 'Recipient selection is required when trigger is "Yes"'
    }
  }
  
  return errors
}

/**
 * Get action category for a question
 * Priority: question.action_category > section category > default
 */
export function getQuestionActionCategory(question, section) {
  // First check question's own category
  if (question.action_category) {
    return question.action_category
  }
  
  // For special sections, use section category
  if (isSpecialSection(section)) {
    return getSectionActionCategory(section)
  }
  
  // Default to 'other'
  return 'other'
}
