'use client'

import { useState, useEffect } from 'react'
import { QUESTION_TYPES } from '@/lib/airtable'
import { getEffectiveQuestionKind } from '../../../lib/question-types'
import { isRecipientQuestion as isRecipientSelectorQuestion } from '../../../lib/template-rules'
import { getGradeButtonStyle } from '@/lib/grading-button-styles'
import {
  indexToCaretakerRowLetter,
  caretakerRowDisplayLabel,
} from '@/lib/caretaker-yesno-display'
import YesNoQuestion from './YesNoQuestion'

const CARETAKER_S12_LAYOUT_SKIP_KINDS = new Set([
  'nv_standard',
  'nv_estate_feedback',
  'nv_issues_report',
  'nv_q24',
  'nv_q25',
])

const caretakerS12CardStyle = {
  marginBottom: '1.25rem',
  padding: '1.25rem',
  border: '1px solid #e5e7eb',
  borderRadius: '0.5rem',
  backgroundColor: '#fafafa',
  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
}

export default function QuestionRenderer({
  question,
  sectionName,
  inspectionId,
  value,
  onChange,
  errors = {},
  section = null,
  sectionQuestions = [],
  allAnswers = {},
  alwaysShowCaretakerComment = false,
  alwaysShowCaretakerCommentPhoto = false,
  alwaysShowCaretakerRecipient = false,
  caretakerSections12Structured = false,
  subLabelIndex = 0,
}) {
  const [localValue, setLocalValue] = useState(value ?? '')
  const [recipientOptions, setRecipientOptions] = useState([])
  const [costCodeOptions, setCostCodeOptions] = useState([])

  useEffect(() => {
    setLocalValue(value ?? '')
  }, [value])

  /** Single-arg: main answer for this question. Two-arg: any key (e.g. _comment, sibling recipient id). */
  const handleChange = (first, second) => {
    if (second !== undefined) {
      onChange(first, second)
      if (first === question.id) setLocalValue(second)
      return
    }
    setLocalValue(first)
    onChange(question.id, first)
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
  const isSelectKind = kind === 'single_select' || kind === 'select'
  const isRecipientField = isRecipientSelectorQuestion(question)
  const isCostCodeQuestion =
    isSelectKind &&
    (questionText.includes('cost code') || questionText.includes('cost_code') || questionText.includes('costcode'))

  useEffect(() => {
    let cancelled = false
    if (!isRecipientField) {
      setRecipientOptions([])
      return () => {
        cancelled = true
      }
    }

    async function loadPeople() {
      try {
        const res = await fetch('/api/people', { cache: 'no-store', credentials: 'include' })
        if (!res.ok) {
          console.warn('[QuestionRenderer] GET /api/people failed:', res.status, await res.text().catch(() => ''))
          return
        }
        const rows = await res.json()
        if (cancelled || !Array.isArray(rows)) {
          if (process.env.NODE_ENV === 'development') {
            console.warn('[QuestionRenderer] /api/people response not an array:', rows)
          }
          return
        }
        const mapped = rows
          .map((p) => ({
            value: p.id != null ? String(p.id) : '',
            label: p.name ? `${p.name}${p.email ? ` (${p.email})` : ''}` : p.email || String(p.id ?? ''),
          }))
          .filter((x) => x.value && x.label)
        if (process.env.NODE_ENV === 'development') {
          console.debug('[QuestionRenderer] recipient dropdown options:', mapped.length, mapped.slice(0, 5))
        }
        setRecipientOptions(mapped)
      } catch (e) {
        console.warn('[QuestionRenderer] loadPeople error:', e)
      }
    }
    loadPeople()
    return () => {
      cancelled = true
    }
  }, [isRecipientField])

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
            section={section}
            sectionQuestions={sectionQuestions}
            allAnswers={allAnswers}
            alwaysShowCaretakerComment={alwaysShowCaretakerComment}
            alwaysShowCaretakerCommentPhoto={alwaysShowCaretakerCommentPhoto}
            alwaysShowCaretakerRecipient={alwaysShowCaretakerRecipient}
          />
        )

      case 'nv_standard':
      case QUESTION_TYPES.GRADED:
      case 'graded': {
        const opts =
          (question.grading_options && question.grading_options.length ? question.grading_options : null) ||
          (question.options && Array.isArray(question.options) && question.options.length ? question.options : null) ||
          ['A', 'B', 'C', 'D', 'NA']
        return (
          <div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
              {opts.map((grade) => {
                const label = typeof grade === 'string' ? grade : String(grade?.value ?? grade?.label ?? grade)
                const isSelected = localValue === label
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => handleChange(label)}
                    style={getGradeButtonStyle(label, isSelected, {
                      padding: '12px 16px',
                      minHeight: 48,
                      fontSize: '1rem',
                      borderRadius: '0.375rem',
                    })}
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
        // Recipient selectors always use Postgres issue_recipients; ignore static Airtable options so the dropdown is not stuck on placeholders.
        const options = isRecipientField
          ? recipientOptions
          : optionsFromQuestion.length > 0
            ? optionsFromQuestion.map((o) => ({ value: o, label: o }))
            : isCostCodeQuestion
              ? costCodeOptions
              : []
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

      case 'nv_estate_feedback':
      case 'nv_issues_report':
        return (
          <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: 0 }}>
            This step is designed for the Neighbourhood Voice wizard. Open the inspection wizard to complete it.
          </p>
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

  if (caretakerSections12Structured && !CARETAKER_S12_LAYOUT_SKIP_KINDS.has(kind)) {
    const letter = indexToCaretakerRowLetter(subLabelIndex)
    const displayLabel = caretakerRowDisplayLabel(letter, question)
    const displayQuestion = { ...question, label: displayLabel }

    if (kind === 'instruction') {
      const body =
        (question.description && String(question.description).trim()) ||
        (question.question_text && String(question.question_text).trim()) ||
        ''
      return (
        <div style={caretakerS12CardStyle}>
          <p style={{ margin: 0, fontWeight: 600, color: '#111827', fontSize: '1rem' }}>{displayQuestion.label}</p>
          {body ? (
            <p
              style={{
                margin: '0.75rem 0 0',
                fontSize: '0.875rem',
                color: '#4b5563',
                whiteSpace: 'pre-wrap',
                lineHeight: 1.5,
              }}
            >
              {body}
            </p>
          ) : null}
        </div>
      )
    }

    return (
      <div style={caretakerS12CardStyle}>
        <YesNoQuestion
          question={displayQuestion}
          sectionName={sectionName}
          inspectionId={inspectionId}
          value={localValue}
          onChange={handleChange}
          errors={errors}
          section={section}
          sectionQuestions={sectionQuestions}
          allAnswers={allAnswers}
          alwaysShowCaretakerComment={true}
          alwaysShowCaretakerCommentPhoto={true}
          alwaysShowCaretakerRecipient={alwaysShowCaretakerRecipient}
          caretakerSections12Structured={true}
        />
      </div>
    )
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

      {alwaysShowCaretakerComment && kind !== 'yes_no' && (
        <div style={{ marginTop: '0.75rem' }}>
          <label
            htmlFor={'caretaker-comment-' + question.id}
            style={{
              display: 'block',
              marginBottom: '0.5rem',
              fontWeight: '500',
              color: '#111827',
            }}
          >
            Comment
          </label>
          <textarea
            id={'caretaker-comment-' + question.id}
            value={allAnswers[question.id + '_comment'] ?? ''}
            onChange={(e) => handleChange(question.id + '_comment', e.target.value)}
            rows={4}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: errors[question.id + '_comment'] ? '1px solid #ef4444' : '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '1rem',
              fontFamily: 'inherit',
            }}
          />
          {errors[question.id + '_comment'] && (
            <p
              style={{
                marginTop: '0.5rem',
                fontSize: '0.875rem',
                color: '#ef4444',
              }}
            >
              {errors[question.id + '_comment']}
            </p>
          )}
        </div>
      )}

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
