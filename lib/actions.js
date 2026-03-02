// Utility functions for managing actions
// Actions are automatically created when Yes/No questions are answered "No"

export const ACTION_TYPES = {
  REPAIRS: 'repairs',
  GROUNDS_MAINTENANCE: 'grounds_maintenance',
  CLEANING: 'cleaning',
}

export const ACTION_TYPE_LABELS = {
  [ACTION_TYPES.REPAIRS]: 'Repairs',
  [ACTION_TYPES.GROUNDS_MAINTENANCE]: 'Grounds Maintenance',
  [ACTION_TYPES.CLEANING]: 'Cleaning',
}

export const ACTION_STATUS = {
  OPEN: 'open',
  IN_PROGRESS: 'in_progress',
  RESOLVED: 'resolved',
}

export const ACTION_STATUS_LABELS = {
  [ACTION_STATUS.OPEN]: 'Open',
  [ACTION_STATUS.IN_PROGRESS]: 'In Progress',
  [ACTION_STATUS.RESOLVED]: 'Resolved',
}

const API_BASE = '/api/actions'

// Create an action automatically when Yes/No = No
export async function createActionFromNoAnswer(actionData) {
  try {
    const response = await fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        ...actionData,
        requires_photo: true, // Always require photo for auto-created actions
        auto_created: true, // Flag to indicate this was auto-created
      }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || 'Failed to create action')
    }

    return await response.json()
  } catch (error) {
    console.error('Error creating action:', error)
    throw error
  }
}

// Get all actions
export async function getAllActions() {
  try {
    const response = await fetch(API_BASE, { cache: 'no-store', credentials: 'include' })

    if (!response.ok) {
      throw new Error('Failed to fetch actions')
    }

    return await response.json()
  } catch (error) {
    console.error('Error fetching actions:', error)
    return []
  }
}

// Process section answers and create actions for "No" answers
export async function processSectionAnswers(inspectionId, sectionId, sectionName, answers) {
  const createdActions = []

  // Check each answer - if it's a Yes/No question answered "No", create an action
  for (const [questionId, answer] of Object.entries(answers)) {
    // Check if this is a Yes/No question with answer "No"
    if (answer === false || answer === 'no' || answer === 'No') {
      // Create action automatically
      try {
        const action = await createActionFromNoAnswer({
          inspection_id: inspectionId,
          section_id: sectionId,
          section_name: sectionName,
          question_id: questionId,
          type: ACTION_TYPES.GROUNDS_MAINTENANCE, // Default to grounds as per requirement
          title: `${sectionName} - Action Required`,
          description: `Action required based on "No" answer in ${sectionName}`,
          status: ACTION_STATUS.OPEN,
          requires_photo: true,
        })
        createdActions.push(action)
      } catch (error) {
        console.error(`Failed to create action for question ${questionId}:`, error)
        // Continue processing other questions even if one fails
      }
    }
  }

  return createdActions
}
