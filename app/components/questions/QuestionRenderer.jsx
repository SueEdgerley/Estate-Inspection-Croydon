'use client'

import { useState, useEffect } from 'react'
import { QUESTION_TYPES } from '@/lib/airtable'
import { getPeople } from '@/lib/airtable'
import YesNoQuestion from './YesNoQuestion'

export default function QuestionRenderer({ question, sectionName, inspectionId, value, onChange, errors = {} }) {
  const [localValue, setLocalValue] = useState(value || '')
  const [peopleOptions, setPeopleOptions] = useState([])
  
  // Load people if this is a "Who to send to?" type question
  useEffect(() => {
    if (question.id === 'who_to_send_to' || question.label?.toLowerCase().includes('who to send')) {
      loadPeople()
    }
  }, [question])
  
  const loadPeople = async () => {
    try {
      const people = await getPeople()
      setPeopleOptions(people.map(person => ({
        value: person.id,
        label: `${person.name} (${person.email})`
      })))
    } catch (error) {
      console.error('Error loading people:', error)
    }
  }

  const handleChange = (newValue) => {
    setLocalValue(newValue)
    onChange(question.id, newValue)
  }

  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    // TODO: Upload to blob storage and get URL
    // For now, create a data URL
    const reader = new FileReader()
    reader.onload = (event) => {
      const photoUrl = event.target.result
      handleChange(photoUrl)
    }
    reader.readAsDataURL(file)
  }

  // Normalize yes/no variants (yesno, yes_no, yes/no) so Yes/No/NA + photo render correctly
  const qType = (question.question_type || '').toString().toLowerCase().replace(/[\s\-/]+/g, '_').replace(/_+$/g, '') || 'text'
  const isYesNo = qType === 'yes_no' || qType === 'yesno'

  const renderQuestion = () => {
    switch (isYesNo ? QUESTION_TYPES.YESNO : question.question_type) {
      case QUESTION_TYPES.YESNO:
        return (
          <YesNoQuestion
            question={question}
            sectionName={sectionName}
            inspectionId={inspectionId}
            value={localValue}
            onChange={handleChange}
            errors={errors}
          />
        )

      case QUESTION_TYPES.GRADED:
        return (
          <div>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
              {[1, 2, 3, 4, 5].map((grade) => (
                <button
                  key={grade}
                  type="button"
                  onClick={() => handleChange(grade)}
                  style={{
                    padding: '0.5rem 1rem',
                    backgroundColor: localValue === grade ? '#3b82f6' : 'white',
                    color: localValue === grade ? 'white' : '#374151',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    cursor: 'pointer',
                    fontWeight: localValue === grade ? '600' : '500'
                  }}
                >
                  {grade}
                </button>
              ))}
            </div>
            {localValue && (
              <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                Selected: {localValue}/5
              </p>
            )}
          </div>
        )

      case QUESTION_TYPES.SINGLE_SELECT:
        // Use people options if available, otherwise use question options
        const options = peopleOptions.length > 0 ? peopleOptions : (question.options || [])
        return (
          <select
            value={localValue}
            onChange={(e) => handleChange(e.target.value)}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: errors[question.id] ? '1px solid #ef4444' : '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '1rem',
              backgroundColor: 'white'
            }}
          >
            <option value="">Select an option...</option>
            {options.map((option, idx) => (
              <option key={idx} value={option.value || option}>
                {option.label || option}
              </option>
            ))}
          </select>
        )

      case QUESTION_TYPES.PHOTO:
        return (
          <div>
            <input
              type="file"
              accept="image/*"
              onChange={handlePhotoUpload}
              style={{
                marginBottom: '0.5rem'
              }}
            />
            {localValue && (
              <div style={{ marginTop: '1rem' }}>
                <img
                  src={localValue}
                  alt="Uploaded"
                  style={{
                    maxWidth: '100%',
                    maxHeight: '300px',
                    borderRadius: '0.375rem',
                    border: '1px solid #e5e7eb'
                  }}
                />
              </div>
            )}
          </div>
        )

      default:
        return (
          <input
            type="text"
            value={localValue}
            onChange={(e) => handleChange(e.target.value)}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: errors[question.id] ? '1px solid #ef4444' : '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '1rem'
            }}
          />
        )
    }
  }

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <label style={{
        display: 'block',
        marginBottom: '0.5rem',
        fontWeight: '500',
        color: '#111827'
      }}>
        {question.label || question.id}
        {question.is_required && (
          <span style={{ color: '#ef4444', marginLeft: '0.25rem' }}>*</span>
        )}
      </label>
      
      {question.description && (
        <p style={{
          fontSize: '0.875rem',
          color: '#6b7280',
          marginBottom: '0.75rem'
        }}>
          {question.description}
        </p>
      )}
      
      {renderQuestion()}
      
      {errors[question.id] && (
        <p style={{
          marginTop: '0.5rem',
          fontSize: '0.875rem',
          color: '#ef4444'
        }}>
          {errors[question.id]}
        </p>
      )}
    </div>
  )
}
