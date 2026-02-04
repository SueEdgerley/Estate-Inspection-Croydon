'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createIssue, ISSUE_TYPES, ISSUE_TYPE_LABELS } from '@/lib/issues'

export default function NewInspection() {
  const router = useRouter()
  const [formData, setFormData] = useState({
    type: ISSUE_TYPES.REPAIRS,
    title: '',
    location: '',
    description: '',
  })
  const [errors, setErrors] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }))
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: '',
      }))
    }
  }

  const validate = () => {
    const newErrors = {}
    
    if (!formData.title.trim()) {
      newErrors.title = 'Title is required'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!validate()) {
      return
    }

    setIsSubmitting(true)

    try {
      const newIssue = await createIssue(formData)
      
      if (newIssue) {
        // Redirect to first section of the inspection
        router.push(`/inspections/${newIssue.id}/section/1`)
      } else {
        setErrors({ submit: 'Failed to create inspection. Please try again.' })
      }
    } catch (error) {
      console.error('Error creating inspection:', error)
      setErrors({ submit: error.message || 'An error occurred. Please try again.' })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div>
      <div style={{ marginBottom: '2rem' }}>
        <Link 
          href="/inspections"
          style={{
            color: '#3b82f6',
            textDecoration: 'none',
            fontSize: '0.875rem',
            display: 'inline-block',
            marginBottom: '1rem',
          }}
        >
          ← Back to Inspections
        </Link>
        <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 'bold' }}>
          Start New Inspection
        </h1>
        <p style={{ margin: '0.5rem 0 0 0', color: '#6b7280' }}>
          Choose block/template and enter basic details
        </p>
      </div>

      <form 
        onSubmit={handleSubmit}
        style={{
          backgroundColor: 'white',
          padding: '2rem',
          borderRadius: '0.5rem',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          maxWidth: '800px'
        }}
      >
        {errors.submit && (
          <div style={{
            padding: '0.75rem',
            marginBottom: '1.5rem',
            backgroundColor: '#fee2e2',
            color: '#dc2626',
            borderRadius: '0.375rem',
            fontSize: '0.875rem',
          }}>
            {errors.submit}
          </div>
        )}

        <div style={{ marginBottom: '1.5rem' }}>
          <label 
            htmlFor="type"
            style={{
              display: 'block',
              marginBottom: '0.5rem',
              fontSize: '0.875rem',
              fontWeight: '500',
              color: '#374151',
            }}
          >
            Inspection Type <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <select
            id="type"
            name="type"
            value={formData.type}
            onChange={handleChange}
            required
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '1rem',
              backgroundColor: 'white',
            }}
          >
            <option value={ISSUE_TYPES.REPAIRS}>
              {ISSUE_TYPE_LABELS[ISSUE_TYPES.REPAIRS]}
            </option>
            <option value={ISSUE_TYPES.GROUNDS_MAINTENANCE}>
              {ISSUE_TYPE_LABELS[ISSUE_TYPES.GROUNDS_MAINTENANCE]}
            </option>
            <option value={ISSUE_TYPES.CLEANING}>
              {ISSUE_TYPE_LABELS[ISSUE_TYPES.CLEANING]}
            </option>
          </select>
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <label 
            htmlFor="title"
            style={{
              display: 'block',
              marginBottom: '0.5rem',
              fontSize: '0.875rem',
              fontWeight: '500',
              color: '#374151',
            }}
          >
            Title <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <input
            type="text"
            id="title"
            name="title"
            value={formData.title}
            onChange={handleChange}
            required
            placeholder="e.g., Block A - Ground Floor Inspection"
            style={{
              width: '100%',
              padding: '0.75rem',
              border: errors.title ? '1px solid #ef4444' : '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '1rem',
            }}
          />
          {errors.title && (
            <p style={{
              margin: '0.5rem 0 0 0',
              fontSize: '0.875rem',
              color: '#ef4444',
            }}>
              {errors.title}
            </p>
          )}
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <label 
            htmlFor="location"
            style={{
              display: 'block',
              marginBottom: '0.5rem',
              fontSize: '0.875rem',
              fontWeight: '500',
              color: '#374151',
            }}
          >
            Location
          </label>
          <input
            type="text"
            id="location"
            name="location"
            value={formData.location}
            onChange={handleChange}
            placeholder="e.g., Block A, Flat 12"
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '1rem',
            }}
          />
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <label 
            htmlFor="description"
            style={{
              display: 'block',
              marginBottom: '0.5rem',
              fontSize: '0.875rem',
              fontWeight: '500',
              color: '#374151',
            }}
          >
            Description
          </label>
          <textarea
            id="description"
            name="description"
            value={formData.description}
            onChange={handleChange}
            rows={5}
            placeholder="Additional notes about this inspection..."
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '1rem',
              fontFamily: 'inherit',
              resize: 'vertical',
            }}
          />
        </div>

        <div style={{
          display: 'flex',
          gap: '1rem',
          justifyContent: 'flex-end',
        }}>
          <Link 
            href="/inspections"
            style={{
              padding: '0.75rem 1.5rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.5rem',
              textDecoration: 'none',
              color: '#374151',
              fontWeight: '500',
              display: 'inline-block',
            }}
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={isSubmitting}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: isSubmitting ? '#9ca3af' : '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              fontSize: '1rem',
              fontWeight: '500',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
            }}
          >
            {isSubmitting ? 'Creating...' : 'Start Inspection'}
          </button>
        </div>
      </form>
    </div>
  )
}
