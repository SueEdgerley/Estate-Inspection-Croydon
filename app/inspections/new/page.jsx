'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import YesNoNaButtons from '@/app/components/questions/YesNoNaButtons'

function shouldShowQuestion(question, answers) {
  if (!question.depends_on_question_id) return true
  const depAnswer = answers[question.depends_on_question_id]
  if (depAnswer === undefined || depAnswer === null) return false
  const showWhen = question.show_when_value
  if (typeof showWhen === 'boolean') return depAnswer === showWhen
  if (typeof showWhen === 'string') return String(depAnswer).toLowerCase() === showWhen.toLowerCase()
  return depAnswer === showWhen
}

function normalizeYesNoNaValue(val) {
  if (val == null) return ''
  const s = String(val).toLowerCase().trim()
  if (s === 'yes' || val === true) return 'Yes'
  if (s === 'no' || val === false) return 'No'
  if (s === 'na') return 'NA'
  if (['yes', 'no', 'na'].includes(s)) return s.charAt(0).toUpperCase() + s.slice(1)
  return ''
}

// Match Airtable "Question Type" values that mean Yes/No/NA (e.g. "yes_no", "yes_no,photo", "yesno", "Yes/No")
function normalizeQuestionType(v) {
  if (v == null || v === '') return 'text'
  const raw = String(v).toLowerCase().trim()
  if (raw.includes('yes_no')) return 'yes_no'
  if (/yes\s*[\/\-]?\s*no|yesno|yes\s+no/.test(raw)) return 'yes_no'
  if (raw.includes('yes') && raw.includes('no')) return 'yes_no'
  const s = raw.replace(/[\s\-/]+/g, '_').replace(/_+$/g, '') || 'text'
  return s === 'yesno' ? 'yes_no' : s
}

function getQuestionType(question) {
  const raw = question.question_type
  const hasYesNoBehavior = (question.comment_required_when === 'on_no' || question.photo_required_when === 'on_no') && !raw
  return normalizeQuestionType(raw || (hasYesNoBehavior ? 'yes_no' : 'text'))
}

function InspectionQuestion({ question, value, onChange, error, errorComment, errorPhotos, answerExtras, onAnswerExtras, createActionOnNo }) {
  const qType = getQuestionType(question)
  const opts = question.options || []
  const isRequired = question.is_required
  const yesNoNaValue = normalizeYesNoNaValue(value)
  const isNo = yesNoNaValue === 'No'
  const commentWhen = question.comment_required_when
  const photoWhen = question.photo_required_when
  const typeIncludesPhoto = !!question.type_includes_photo
  const showComment = (commentWhen === 'on_no' && isNo) || commentWhen === 'always'
  const showPhoto = (photoWhen === 'on_no' && isNo) || photoWhen === 'always' || (qType === 'yes_no' && typeIncludesPhoto)
  const showActionBlock = qType === 'yes_no' && isNo && createActionOnNo
  const extras = answerExtras || { comment: '', photoUrls: [] }

  const handleChange = (val) => {
    onChange(question.id, val)
    if (qType === 'yes_no' && (val === 'Yes' || val === 'NA') && onAnswerExtras) {
      onAnswerExtras(question.id, { comment: '', photoUrls: [] })
    }
  }

  const setExtras = (updates) => {
    if (onAnswerExtras) onAnswerExtras(question.id, { ...extras, ...updates })
  }

  const handlePhotoUpload = async (e) => {
    const files = e.target.files
    if (!files?.length || !onAnswerExtras) return
    for (const file of Array.from(files)) {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('inspection_id', 'new')
      fd.append('question_id', question.id)
      try {
        const res = await fetch('/api/photos/upload', { method: 'POST', body: fd })
        const data = await res.json()
        if (data?.url) setExtras({ photoUrls: [...(extras.photoUrls || []), data.url] })
      } catch (err) {
        console.error('Photo upload failed:', err)
      }
    }
    e.target.value = ''
  }

  const buttonGroup = (optionList) => (
    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
      {(optionList || []).map((opt) => {
        const label = typeof opt === 'string' ? opt : (opt?.label ?? opt?.value ?? opt)
        const val = typeof opt === 'string' ? opt : (opt?.value ?? opt?.label ?? opt)
        const isSelected = value === val || value === label
        return (
          <button
            key={val}
            type="button"
            onClick={() => handleChange(val)}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: isSelected ? '#3b82f6' : '#f3f4f6',
              color: isSelected ? 'white' : '#374151',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              cursor: 'pointer',
              fontWeight: isSelected ? 600 : 500,
              fontSize: '0.9375rem',
            }}
          >
            {label}
          </button>
        )
      })}
    </div>
  )

  if (qType === 'yes_no') {
    return (
      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: '#374151' }}>
          {question.question_text}
          {isRequired && <span style={{ color: '#ef4444', marginLeft: 4 }}>*</span>}
        </label>
        <YesNoNaButtons
          value={yesNoNaValue}
          onChange={(val) => handleChange(val)}
        />
        {(showComment || showPhoto || showActionBlock) && (
          <div style={{ marginTop: '1rem', padding: '1rem', background: showActionBlock ? '#fef3c7' : '#f9fafb', borderRadius: '0.375rem', border: `1px solid ${showActionBlock ? '#f59e0b' : '#e5e7eb'}` }}>
            {showActionBlock && (
              <p style={{ fontWeight: 600, marginBottom: '0.75rem', color: '#92400e' }}>
                Action will be created automatically
              </p>
            )}
            {showComment && (
              <>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>
                  Resident-friendly message (for poster PDF){commentWhen === 'always' || (commentWhen === 'on_no' && isNo) ? ' ' : ''}
                  {(commentWhen === 'always' || (commentWhen === 'on_no' && isNo)) && <span style={{ color: '#ef4444' }}>*</span>}
                </label>
                <textarea
                  value={extras.comment || ''}
                  onChange={(e) => setExtras({ comment: e.target.value })}
                  placeholder="e.g. Please ensure the area is kept clear."
                  rows={2}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: errorComment ? '1px solid #ef4444' : '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    fontSize: '0.875rem',
                    fontFamily: 'inherit',
                    marginBottom: '0.75rem',
                  }}
                />
                {errorComment && <p style={{ marginTop: 4, fontSize: '0.875rem', color: '#ef4444' }}>{errorComment}</p>}
              </>
            )}
            {showPhoto && (
              <>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>
                  Photos
                  {(photoWhen === 'always' || (photoWhen === 'on_no' && isNo)) && <span style={{ color: '#ef4444' }}>*</span>}
                </label>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handlePhotoUpload}
                  style={{ fontSize: '0.875rem', marginBottom: '0.5rem' }}
                />
                {(extras.photoUrls || []).length > 0 && (
                  <p style={{ marginTop: '0.5rem', fontSize: '0.8125rem', color: '#6b7280' }}>
                    {(extras.photoUrls || []).length} photo(s) added
                  </p>
                )}
                {errorPhotos && <p style={{ marginTop: 4, fontSize: '0.875rem', color: '#ef4444' }}>{errorPhotos}</p>}
              </>
            )}
            {showActionBlock && question.action_category && (
              <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.5rem', fontStyle: 'italic' }}>
                Action category: {question.action_category}
              </p>
            )}
          </div>
        )}
        {error && typeof error === 'string' && <p style={{ marginTop: 4, fontSize: '0.875rem', color: '#ef4444' }}>{error}</p>}
      </div>
    )
  }

  if (qType === 'graded') {
    const gradingOpts = question.grading_options || ['A', 'B', 'C', 'D', 'NA']
    return (
      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: '#374151' }}>
          {question.question_text}
          {question.grading_scheme_name && (
            <span style={{ fontWeight: 400, color: '#6b7280', fontSize: '0.875rem' }}> ({question.grading_scheme_name})</span>
          )}
          {isRequired && <span style={{ color: '#ef4444', marginLeft: 4 }}>*</span>}
        </label>
        {buttonGroup(gradingOpts)}
        {error && <p style={{ marginTop: 4, fontSize: '0.875rem', color: '#ef4444' }}>{error}</p>}
      </div>
    )
  }

  if (qType === 'select' || qType === 'single_select') {
    const options = opts.map((o) => (typeof o === 'string' ? o : (o.value ?? o.label ?? o))).filter(Boolean)
    return (
      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: '#374151' }}>
          {question.question_text}
          {isRequired && <span style={{ color: '#ef4444', marginLeft: 4 }}>*</span>}
        </label>
        <select
          value={value ?? ''}
          onChange={(e) => handleChange(e.target.value)}
          style={{
            width: '100%',
            padding: '0.75rem',
            border: error ? '1px solid #ef4444' : '1px solid #d1d5db',
            borderRadius: '0.375rem',
            fontSize: '1rem',
            backgroundColor: 'white',
          }}
        >
          <option value="">Select...</option>
          {(options.length ? options : ['—']).map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
        {error && <p style={{ marginTop: 4, fontSize: '0.875rem', color: '#ef4444' }}>{error}</p>}
      </div>
    )
  }

  if (qType === 'rating') {
    const max = 5
    return (
      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: '#374151' }}>
          {question.question_text}
          {isRequired && <span style={{ color: '#ef4444', marginLeft: 4 }}>*</span>}
        </label>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => handleChange(n)}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: value === n ? '#3b82f6' : '#f3f4f6',
                color: value === n ? 'white' : '#374151',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
                cursor: 'pointer',
                fontWeight: value === n ? 600 : 500,
              }}
            >
              {n}
            </button>
          ))}
        </div>
        {error && <p style={{ marginTop: 4, fontSize: '0.875rem', color: '#ef4444' }}>{error}</p>}
      </div>
    )
  }

  // text and fallback
  return (
    <div style={{ marginBottom: '1rem' }}>
      <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: '#374151' }}>
        {question.question_text}
        {isRequired && <span style={{ color: '#ef4444', marginLeft: 4 }}>*</span>}
      </label>
      <input
        type="text"
        value={value ?? ''}
        onChange={(e) => handleChange(e.target.value)}
        style={{
          width: '100%',
          padding: '0.75rem',
          border: error ? '1px solid #ef4444' : '1px solid #d1d5db',
          borderRadius: '0.375rem',
          fontSize: '1rem',
        }}
      />
      {error && <p style={{ marginTop: 4, fontSize: '0.875rem', color: '#ef4444' }}>{error}</p>}
    </div>
  )
}

export default function NewInspectionPage() {
  const router = useRouter()
  const [apiPayload, setApiPayload] = useState({ templates: [] })
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [templateId, setTemplateId] = useState('')
  const [title, setTitle] = useState('')
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')
  const [answers, setAnswers] = useState({})
  const [answerExtras, setAnswerExtras] = useState({})
  const [submitError, setSubmitError] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [validationErrors, setValidationErrors] = useState({})

  useEffect(() => {
    let cancelled = false
    fetch('/api/templates')
      .then((res) => {
        if (!res.ok) throw new Error(res.status === 503 ? 'Airtable not configured' : 'Failed to load templates')
        return res.json()
      })
      .then((data) => {
        if (!cancelled) {
          setApiPayload(data)
          const list = data.templates || []
          if (list.length > 0 && !templateId) setTemplateId(list[0].id)
        }
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const templates = apiPayload.templates || []
  const selectedTemplate = templates.find((t) => t.id === templateId)

  const handleAnswer = (questionId, value) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }))
    setValidationErrors((prev) => ({
      ...prev,
      [questionId]: undefined,
      [`${questionId}_comment`]: undefined,
      [`${questionId}_photos`]: undefined,
    }))
  }

  const validate = () => {
    const errs = {}
    if (!title.trim()) errs.title = 'Title is required'
    if (!templateId) errs.template_id = 'Select a template'
    if (!selectedTemplate) return { ...errs }

    selectedTemplate.sections.forEach((sec) => {
      (sec.questions || []).forEach((q) => {
        if (!shouldShowQuestion(q, answers)) return
        const qType = getQuestionType(q)
        const v = answers[q.id]

        if (qType === 'yes_no') {
          const validValues = ['Yes', 'No', 'NA']
          const normalized = v != null ? String(v).trim() : ''
          if (q.is_required && !validValues.includes(normalized)) {
            errs[q.id] = 'Please select Yes, No, or NA'
          }
          const commentWhen = q.comment_required_when
          const photoWhen = q.photo_required_when
          const isNo = normalized === 'No'
          const showComment = (commentWhen === 'on_no' && isNo) || commentWhen === 'always'
          const showPhoto = (photoWhen === 'on_no' && isNo) || photoWhen === 'always'
          const commentRequired = (commentWhen === 'on_no' && isNo) || commentWhen === 'always'
          const photoRequired = (photoWhen === 'on_no' && isNo) || photoWhen === 'always'
          const extras = answerExtras[q.id] || {}
          if (showComment && commentRequired && !(extras.comment || '').trim()) {
            errs[`${q.id}_comment`] = 'Comment is required'
          }
          if (showPhoto && photoRequired && !(extras.photoUrls || []).length) {
            errs[`${q.id}_photos`] = 'At least one photo is required'
          }
          return
        }

        if (!q.is_required) return
        if (v === undefined || v === null || (typeof v === 'string' && !v.trim())) {
          errs[q.id] = 'Required'
        }
      })
    })
    setValidationErrors(errs)
    return errs
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitError(null)
    const errs = validate()
    if (Object.keys(errs).length > 0) return

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/inspections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_id: templateId,
          title: title.trim(),
          location: location.trim() || undefined,
          description: description.trim() || undefined,
          answers,
          answer_extras: answerExtras,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setSubmitError(data.error || data.details || `Request failed (${res.status})`)
        return
      }
      const inspectionId = data.inspectionId ?? data.id
      if (inspectionId) {
        router.push(`/inspections/${inspectionId}`)
      } else {
        router.push('/inspections')
      }
    } catch (err) {
      setSubmitError(err.message || 'Something went wrong')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div>
        <p>Loading templates...</p>
      </div>
    )
  }

  if (loadError) {
    return (
      <div>
        <Link href="/inspections" style={{ color: '#3b82f6', textDecoration: 'none', fontSize: '0.875rem' }}>
          ← Back to Inspections
        </Link>
        <div style={{ marginTop: '1rem', padding: '1rem', background: '#fee2e2', color: '#dc2626', borderRadius: '0.5rem' }}>
          {loadError}
        </div>
      </div>
    )
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
          New Inspection
        </h1>
        <p style={{ margin: '0.5rem 0 0 0', color: '#6b7280' }}>
          Choose a template and complete the form
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        style={{
          backgroundColor: 'white',
          padding: '2rem',
          borderRadius: '0.5rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          maxWidth: '800px',
        }}
      >
        {submitError && (
          <div
            style={{
              padding: '0.75rem',
              marginBottom: '1.5rem',
              backgroundColor: '#fee2e2',
              color: '#dc2626',
              borderRadius: '0.375rem',
              fontSize: '0.875rem',
            }}
          >
            {submitError}
          </div>
        )}

        <div style={{ marginBottom: '1.5rem' }}>
          <label
            htmlFor="template_id"
            style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}
          >
            Template <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <select
            id="template_id"
            value={templateId}
            onChange={(e) => {
              setTemplateId(e.target.value)
              setAnswers({})
              setAnswerExtras({})
              setValidationErrors({})
            }}
            required
            style={{
              width: '100%',
              padding: '0.75rem',
              border: validationErrors.template_id ? '1px solid #ef4444' : '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '1rem',
              backgroundColor: 'white',
            }}
          >
            <option value="">— Select template —</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {(t.name || t.template_key || '').trim() && !(t.name || t.template_key || '').trim().startsWith('rec')
                  ? (t.name || t.template_key).trim()
                  : `Template ${(t.id || '').slice(0, 12)}…`}
              </option>
            ))}
          </select>
          {validationErrors.template_id && (
            <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#ef4444' }}>{validationErrors.template_id}</p>
          )}
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <label
            htmlFor="title"
            style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}
          >
            Title <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <input
            type="text"
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Block A – Ground Floor"
            style={{
              width: '100%',
              padding: '0.75rem',
              border: validationErrors.title ? '1px solid #ef4444' : '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '1rem',
            }}
          />
          {validationErrors.title && (
            <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#ef4444' }}>{validationErrors.title}</p>
          )}
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <label
            htmlFor="location"
            style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}
          >
            Location
          </label>
          <input
            type="text"
            id="location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Block A, Flat 12"
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '1rem',
            }}
          />
        </div>

        {selectedTemplate && selectedTemplate.sections && selectedTemplate.sections.length > 0 && (
          <div style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem', color: '#111827' }}>
              Sections &amp; questions
            </h2>
            {selectedTemplate.sections.map((section) => (
              <div
                key={section.id}
                style={{
                  marginBottom: '2rem',
                  paddingBottom: '1.5rem',
                  borderBottom: '1px solid #e5e7eb',
                }}
              >
                <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.5rem', color: '#374151' }}>
                  {section.title}
                </h3>
                {section.help_text && (
                  <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1rem' }}>{section.help_text}</p>
                )}
                {(section.questions || []).map((q) => {
                  if (!shouldShowQuestion(q, answers)) return null
                  return (
                    <InspectionQuestion
                      key={q.id}
                      question={q}
                      value={answers[q.id]}
                      onChange={handleAnswer}
                      error={validationErrors[q.id]}
                      errorComment={validationErrors[`${q.id}_comment`]}
                      errorPhotos={validationErrors[`${q.id}_photos`]}
                      answerExtras={answerExtras[q.id]}
                      onAnswerExtras={(questionId, extras) => setAnswerExtras((prev) => ({ ...prev, [questionId]: extras }))}
                      createActionOnNo={q.create_action_on_no}
                    />
                  )
                })}
              </div>
            ))}
          </div>
        )}

        <div style={{ marginBottom: '1.5rem' }}>
          <label
            htmlFor="description"
            style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}
          >
            Description
          </label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Additional notes..."
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

        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
          <Link
            href="/inspections"
            style={{
              padding: '0.75rem 1.5rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.5rem',
              textDecoration: 'none',
              color: '#374151',
              fontWeight: 500,
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
              fontWeight: 500,
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
            }}
          >
            {isSubmitting ? 'Saving...' : 'Save inspection'}
          </button>
        </div>
      </form>
    </div>
  )
}
