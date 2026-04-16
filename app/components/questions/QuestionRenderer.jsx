'use client'

import { useState, useEffect } from 'react'
import { QUESTION_TYPES } from '@/lib/airtable'
import { getEffectiveQuestionKind } from '../../../lib/question-types'
import YesNoQuestion from './YesNoQuestion'

export default function QuestionRenderer({ question, sectionName, inspectionId, value, onChange, errors = {} }) {
  const [localValue, setLocalValue] = useState(value ?? '')
  const [recipientOptions, setRecipientOptions] = useState([])
  const [costCodeOptions, setCostCodeOptions] = useState([])

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
  const rendersOwnHeading = kind === 'yes_no'
  const questionText = String(question.label || question.question_text || '').toLowerCase()
  const isRecipientQuestion =
    kind === 'single_select' &&
    (questionText.includes('who to send') ||
      questionText.includes('recipient') ||
      questionText.includes('send to'))
  const isCostCodeQuestion =
    kind === 'single_select' &&
    (questionText.includes('cost code') || questionText.includes('cost_code') || questionText.includes('costcode'))

  useEffect(() => {
    let cancelled = false
    if (!isRecipientQuestion) {
      setRecipientOptions([])
      return () => {
        cancelled = true
      }
    }

    async function loadPeople() {
      try {
        const res = await fetch('/api/people', { cache: 'no-store', credentials: 'include' })
        if (!res.ok) return
        const rows = await res.json()
        if (cancelled || !Array.isArray(rows)) return
        const mapped = rows
          .map((p) => ({
            value: p.id,
            label: p.name ? `${p.name}${p.email ? ` (${p.email})` : ''}` : p.email || p.id,
          }))
          .filter((x) => x.value && x.label)
        setRecipientOptions(mapped)
      } catch {
        // keep empty options fallback
      }
    }
    loadPeople()
    return () => {
      cancelled = true
    }
  }, [isRecipientQuestion])

  useEffect(() => {
    let cancelled = false
    if (!isCostCodeQuestion) {
      setCostCodeOptions([])
      return () => {
        cancelled = true
      }
    }

    async function loadCostCodes() {
      try {
        const res = await fetch('/api/cost-codes', { cache: 'no-store', credentials: 'include' })
        if (!res.ok) return
        const rows = await res.json()
        if (cancelled || !Array.isArray(rows)) return
        const mapped = rows
          .map((c) => ({
            value: c.code,
            label: c.description ? `${c.code} - ${c.description}` : c.code,
          }))
          .filter((x) => x.value && x.label)
        setCostCodeOptions(mapped)
      } catch {
        // keep empty options fallback
      }
    }
    loadCostCodes()
    return () => {
      cancelled = true
    }
  }, [isCostCodeQuestion])

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
        const optionsFromQuestion = Array.isArray(rawOpts)
          ? rawOpts.map((o) => (typeof o === 'string' ? o : o?.value ?? o?.label ?? o))
          : String(rawOpts)
              .split(/\r?\n|,/)
              .map((p) => p.trim())
              .filter(Boolean)
        const options =
          optionsFromQuestion.length > 0
            ? optionsFromQuestion.map((o) => ({ value: o, label: o }))
            : (isRecipientQuestion ? recipientOptions : (isCostCodeQuestion ? costCodeOptions : []))
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
            {(options.length ? options : [{ value: '', label: '—' }]).map((option, idx) => (
              <option key={idx} value={option.value}>
                {option.label}
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

      case 'nv_q24':
        return (
          <textarea
            value={localValue ?? ''}
            onChange={(e) => handleChange(e.target.value)}
            rows={4}
            placeholder="Additional comments (optional)"
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

      case 'nv_q25':
        return (
          <textarea
            value={localValue ?? ''}
            onChange={(e) => handleChange(e.target.value)}
            rows={2}
            placeholder="Sign-off (date and name if editing outside the wizard)"
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

      case 'instruction':
        return (
          <p style={{ fontSize: '0.9375rem', color: '#4b5563', margin: 0 }}>
            {question.description || question.label || question.question_text || ''}
          </p>
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
      {!rendersOwnHeading && (
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
      )}

      {!rendersOwnHeading && question.description && (
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
