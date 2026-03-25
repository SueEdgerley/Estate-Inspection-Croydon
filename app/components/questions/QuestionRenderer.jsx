'use client'

import { useState, useEffect } from 'react'
import { QUESTION_TYPES } from '@/lib/airtable'
import { getEffectiveQuestionKind } from '../../../lib/question-types'
import YesNoQuestion from './YesNoQuestion'

export default function QuestionRenderer({ question, sectionName, inspectionId, value, onChange, errors = {} }) {
  const [localValue, setLocalValue] = useState(value ?? '')

  useEffect(() => {
    setLocalValue(value ?? '')
  }, [value])

  const handleChange = (newValue) => {
    setLocalValue(newValue)
    onChange(question.id, newValue)
  }

  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const photoUrl = event.target.result
      handleChange(photoUrl)
    }
    reader.readAsDataURL(file)
  }

  const kind = getEffectiveQuestionKind(question)

  const renderQuestion = () => {
    switch (kind) {
      case 'yes_no':
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
      case 'graded': {
        const opts =
          (question.grading_options && question.grading_options.length ? question.grading_options : null) ||
          (question.options && Array.isArray(question.options) && question.options.length ? question.options : null) ||
          ['A', 'B', 'C', 'D', 'NA']
        return (
          <div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
              {opts.map((grade) => {
                const label = typeof grade === 'string' ? grade : String(grade?.value ?? grade?.label ?? grade)
                const isSelected = localValue === label
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => handleChange(label)}
                    style={{
                      padding: '0.5rem 1rem',
                      backgroundColor: isSelected ? '#3b82f6' : 'white',
                      color: isSelected ? 'white' : '#374151',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      cursor: 'pointer',
                      fontWeight: isSelected ? '600' : '500',
                    }}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
            {localValue != null && localValue !== '' && (
              <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>Selected: {String(localValue)}</p>
            )}
          </div>
        )
      }

      case 'rating': {
        const max = 5
        const selected = typeof localValue === 'number' ? localValue : parseInt(String(localValue), 10)
        return (
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => handleChange(n)}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: selected === n ? '#3b82f6' : 'white',
                  color: selected === n ? 'white' : '#374151',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                  fontWeight: selected === n ? '600' : '500',
                }}
              >
                {n}
              </button>
            ))}
          </div>
        )
      }

      case QUESTION_TYPES.SINGLE_SELECT:
      case 'single_select':
      case 'select': {
        const rawOpts = question.options || []
        const options = Array.isArray(rawOpts)
          ? rawOpts.map((o) => (typeof o === 'string' ? o : o?.value ?? o?.label ?? o))
          : String(rawOpts)
              .split(/\r?\n|,/)
              .map((p) => p.trim())
              .filter(Boolean)
        return (
          <select
            value={localValue ?? ''}
            onChange={(e) => handleChange(e.target.value)}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: errors[question.id] ? '1px solid #ef4444' : '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '1rem',
              backgroundColor: 'white',
            }}
          >
            <option value="">Select an option...</option>
            {(options.length ? options : ['—']).map((option, idx) => (
              <option key={idx} value={option}>
                {option}
              </option>
            ))}
          </select>
        )
      }

      case QUESTION_TYPES.PHOTO:
      case 'photo':
        return (
          <div>
            <input
              type="file"
              accept="image/*"
              onChange={handlePhotoUpload}
              style={{
                marginBottom: '0.5rem',
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
                    border: '1px solid #e5e7eb',
                  }}
                />
              </div>
            )}
          </div>
        )

      case 'number':
        return (
          <input
            type="number"
            value={localValue ?? ''}
            onChange={(e) => handleChange(e.target.value)}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: errors[question.id] ? '1px solid #ef4444' : '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '1rem',
            }}
          />
        )

      case 'long_text':
        return (
          <textarea
            value={localValue ?? ''}
            onChange={(e) => handleChange(e.target.value)}
            rows={4}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: errors[question.id] ? '1px solid #ef4444' : '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '1rem',
              fontFamily: 'inherit',
            }}
          />
        )

      default:
        return (
          <input
            type="text"
            value={localValue ?? ''}
            onChange={(e) => handleChange(e.target.value)}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: errors[question.id] ? '1px solid #ef4444' : '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '1rem',
            }}
          />
        )
    }
  }

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <label
        style={{
          display: 'block',
          marginBottom: '0.5rem',
          fontWeight: '500',
          color: '#111827',
        }}
      >
        {question.label || question.id}
        {question.is_required && <span style={{ color: '#ef4444', marginLeft: '0.25rem' }}>*</span>}
      </label>

      {question.description && (
        <p
          style={{
            fontSize: '0.875rem',
            color: '#6b7280',
            marginBottom: '0.75rem',
          }}
        >
          {question.description}
        </p>
      )}

      {renderQuestion()}

      {errors[question.id] && (
        <p
          style={{
            marginTop: '0.5rem',
            fontSize: '0.875rem',
            color: '#ef4444',
          }}
        >
          {errors[question.id]}
        </p>
      )}
    </div>
  )
}
