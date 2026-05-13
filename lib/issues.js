// Utility functions for managing issues
// Uses Vercel Postgres via API routes

export const ISSUE_TYPES = {
  REPAIRS: 'repairs',
  GROUNDS_MAINTENANCE: 'grounds_maintenance',
  CLEANING: 'cleaning',
  PEST_CONTROL: 'pest_control',
}

export const ISSUE_TYPE_LABELS = {
  [ISSUE_TYPES.REPAIRS]: 'Repairs',
  [ISSUE_TYPES.GROUNDS_MAINTENANCE]: 'Grounds Maintenance',
  [ISSUE_TYPES.CLEANING]: 'Cleaning',
  [ISSUE_TYPES.PEST_CONTROL]: 'Pest Control',
}

export const ISSUE_STATUS = {
  OPEN: 'open',
  IN_PROGRESS: 'in_progress',
  RESOLVED: 'resolved',
}

export const ISSUE_STATUS_LABELS = {
  [ISSUE_STATUS.OPEN]: 'Open',
  [ISSUE_STATUS.IN_PROGRESS]: 'In Progress',
  [ISSUE_STATUS.RESOLVED]: 'Resolved',
}

const API_BASE = '/api/issues'

// Get all issues from the API
export async function getAllIssues() {
  try {
    const response = await fetch(API_BASE, { cache: 'no-store', credentials: 'include' })
    
    if (!response.ok) {
      throw new Error('Failed to fetch issues')
    }
    
    return await response.json()
  } catch (error) {
    console.error('Error fetching issues:', error)
    return []
  }
}

// Create a new issue (now supports template_id for inspections)
export async function createIssue(issueData) {
  try {
    const response = await fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(issueData),
    })
    
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to create issue')
    }
    
    return await response.json()
  } catch (error) {
    console.error('Error creating issue:', error)
    throw error
  }
}

// Update an existing issue
export async function updateIssue(id, updates) {
  try {
    const response = await fetch(`${API_BASE}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(updates),
    })
    
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to update issue')
    }
    
    return await response.json()
  } catch (error) {
    console.error('Error updating issue:', error)
    throw error
  }
}

// Delete an issue
export async function deleteIssue(id) {
  try {
    const response = await fetch(`${API_BASE}/${id}`, { method: 'DELETE', credentials: 'include' })
    
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to delete issue')
    }
    
    return true
  } catch (error) {
    console.error('Error deleting issue:', error)
    throw error
  }
}
