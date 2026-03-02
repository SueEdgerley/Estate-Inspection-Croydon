// Airtable integration utilities
// Templates, sections, and questions are read from Airtable (read-only)
// This file provides client-side access via API routes

import {
  getTemplates as getTemplatesFromAirtable,
  getTemplateSections as getTemplateSectionsFromAirtable,
  getSectionQuestions as getSectionQuestionsFromAirtable,
  getPeople as getPeopleFromAirtable,
  normalizeQuestion,
  normalizeSection,
  normalizeTemplate,
  normalizePerson
} from './airtable-client'

// Question types
export const QUESTION_TYPES = {
  YESNO: 'yesno',
  GRADED: 'graded',
  SINGLE_SELECT: 'single_select',
  PHOTO: 'photo',
}

// Fetch templates from Airtable (via API route for client-side)
export async function getTemplates() {
  try {
    const response = await fetch('/api/airtable/templates', { cache: 'no-store', credentials: 'include' })
    
    if (!response.ok) {
      throw new Error('Failed to fetch templates')
    }
    
    return await response.json()
  } catch (error) {
    console.error('Error fetching templates:', error)
    return []
  }
}

// Fetch sections for a template
export async function getTemplateSections(templateId) {
  try {
    const response = await fetch(`/api/airtable/templates/${templateId}/sections`, { cache: 'no-store', credentials: 'include' })
    
    if (!response.ok) {
      throw new Error('Failed to fetch sections')
    }
    
    return await response.json()
  } catch (error) {
    console.error('Error fetching sections:', error)
    return []
  }
}

// Fetch questions for a section
export async function getSectionQuestions(sectionId) {
  try {
    const response = await fetch(`/api/airtable/sections/${sectionId}/questions`, { cache: 'no-store', credentials: 'include' })
    
    if (!response.ok) {
      throw new Error('Failed to fetch questions')
    }
    
    const questions = await response.json()
    // Normalize questions to ensure consistent format
    return questions.map(normalizeQuestion)
  } catch (error) {
    console.error('Error fetching questions:', error)
    return []
  }
}

// Fetch people from Airtable (for recipient selection)
export async function getPeople() {
  try {
    const response = await fetch('/api/airtable/people', { cache: 'no-store', credentials: 'include' })
    
    if (!response.ok) {
      throw new Error('Failed to fetch people')
    }
    
    return await response.json()
  } catch (error) {
    console.error('Error fetching people:', error)
    return []
  }
}

// Check if a question should be shown based on conditional logic
export function shouldShowQuestion(question, answers) {
  // If no dependency, always show
  if (!question.depends_on_question_id) {
    return true
  }
  
  // Get the answer to the dependency question
  const dependencyAnswer = answers[question.depends_on_question_id]
  
  if (dependencyAnswer === undefined || dependencyAnswer === null) {
    return false
  }
  
  // Check if the answer matches the show_when_value
  const showWhenValue = question.show_when_value
  
  // Handle different value types
  if (typeof showWhenValue === 'boolean') {
    return dependencyAnswer === showWhenValue
  }
  
  if (typeof showWhenValue === 'string') {
    // Case-insensitive comparison
    return String(dependencyAnswer).toLowerCase() === showWhenValue.toLowerCase()
  }
  
  // Exact match for other types
  return dependencyAnswer === showWhenValue
}

// Get all visible questions for a section (with conditional logic applied)
export function getVisibleQuestions(questions, answers) {
  return questions.filter(question => shouldShowQuestion(question, answers))
}

// Validate required questions
export function validateRequiredQuestions(questions, answers) {
  const errors = {}
  const visibleQuestions = getVisibleQuestions(questions, answers)
  
  visibleQuestions.forEach(question => {
    if (question.is_required) {
      const answer = answers[question.id]
      
      if (answer === undefined || answer === null || answer === '') {
        errors[question.id] = `${question.label || question.id} is required`
      }
      
      // Special validation for photo questions
      if (question.question_type === QUESTION_TYPES.PHOTO && !answer) {
        errors[question.id] = 'Photo is required'
      }
    }
  })
  
  return errors
}
