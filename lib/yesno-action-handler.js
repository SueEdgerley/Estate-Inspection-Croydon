// Handler for Yes/No question actions
// Automatically creates/updates actions when answer is "No"
// Closes actions when answer changes to "Yes"

const ACTION_CATEGORIES = {
  GROUNDS: 'grounds',
  CLEANING: 'cleaning',
  REPAIRS: 'repairs',
  ASB: 'asb',
  HEALTH_SAFETY: 'health_safety',
  FIRE_SAFETY: 'fire_safety',
  OTHER: 'other'
}

/**
 * Create or update action when Yes/No = "No"
 */
export async function handleNoAnswer({
  inspectionId,
  sectionId,
  sectionName,
  questionId,
  questionText,
  question,
  comment,
  photos,
  priority,
  recipientPersonId
}) {
  try {
    // Check if action already exists for this question
    const existingResponse = await fetch(`/api/actions?inspection_id=${inspectionId}&question_id=${questionId}`)
    let existingAction = null
    
    if (existingResponse.ok) {
      const actions = await existingResponse.json()
      existingAction = actions.find(a => a.question_id === questionId)
    }
    
    const actionData = {
      inspection_id: inspectionId,
      section_id: sectionId,
      section_name: sectionName,
      question_id: questionId,
      category: question.action_category || ACTION_CATEGORIES.OTHER,
      priority: priority || question.action_priority || null,
      title: `${sectionName} – ${questionText}`,
      description: `Section: ${sectionName} – ${questionText}`,
      comment: comment || null,
      recipient_person_id: recipientPersonId || null,
      status: 'open',
      auto_created: true
    }
    
    if (existingAction) {
      // Update existing action
      const response = await fetch(`/api/actions/${existingAction.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(actionData)
      })
      
      if (!response.ok) throw new Error('Failed to update action')
      
      // Link photos to action
      if (photos && photos.length > 0) {
        await linkPhotosToAction(existingAction.id, photos)
      }
      
      return await response.json()
    } else {
      // Create new action
      const response = await fetch('/api/actions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(actionData)
      })
      
      if (!response.ok) throw new Error('Failed to create action')
      
      const newAction = await response.json()
      
      // Link photos to action
      if (photos && photos.length > 0) {
        await linkPhotosToAction(newAction.id, photos)
      }
      
      return newAction
    }
  } catch (error) {
    console.error('Error handling No answer:', error)
    throw error
  }
}

/**
 * Close/remove action when answer changes from No to Yes
 */
export async function handleYesAnswer(inspectionId, questionId) {
  try {
    // Find action for this question
    const response = await fetch(`/api/actions?inspection_id=${inspectionId}&question_id=${questionId}`)
    
    if (!response.ok) return
    
    const actions = await response.json()
    const action = actions.find(a => a.question_id === questionId)
    
    if (action) {
      // Mark as resolved
      await fetch(`/api/actions/${action.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'resolved',
          description: `${action.description} (Resolved - answer changed to Yes)`
        })
      })
    }
  } catch (error) {
    console.error('Error handling Yes answer:', error)
    // Don't throw - this is cleanup, shouldn't block the flow
  }
}

/**
 * Link photos to an action
 */
async function linkPhotosToAction(actionId, photoIds) {
  try {
    await fetch(`/api/actions/${actionId}/photos`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ photo_ids: photoIds })
    })
  } catch (error) {
    console.error('Error linking photos to action:', error)
  }
}

/**
 * Check if question requires action creation on "No"
 */
export function shouldCreateActionOnNo(question) {
  return question.create_action_on_no !== false // Default true
}

/**
 * Check if question requires photo on "No"
 */
export function requiresPhotoOnNo(question) {
  return question.require_photo_on_no !== false // Default true
}

/**
 * Check if question requires comment on "No"
 */
export function requiresCommentOnNo(question) {
  return question.require_comment_on_no !== false // Default true
}
