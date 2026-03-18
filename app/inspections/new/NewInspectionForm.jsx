'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import YesNoNaButtons from '@/app/components/questions/YesNoNaButtons'
import PhotoUploadControl from '@/app/components/questions/PhotoUploadControl'

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

function InspectionQuestion({ question, value, onChange, error, errorComment, errorPhotos, answerExtras, onAnswerExtras, createActionOnNo, isNvTemplate = false, expandedByQuestionId = {} }) {
  const id = `answer-${question.id}`
  const qType = getQuestionType(question)
  const opts = question.options || []
  const isRequired = question.is_required
  const yesNoNaValue = normalizeYesNoNaValue(value)
  const isNo = yesNoNaValue === 'No'
  const commentWhen = question.comment_required_when
  const photoWhen = question.photo_required_when
  const typeIncludesPhoto = !!question.type_includes_photo
  const showComment = (commentWhen === 'on_no' && isNo) || commentWhen === 'always'
  const photoRequired = (photoWhen === 'on_no' && isNo) || photoWhen === 'always'
  const showActionBlock = qType === 'yes_no' && isNo && createActionOnNo
  const isExpanded = isNvTemplate && !!expandedByQuestionId[question.id]
  const showCommentPhotoBlock = (showComment || showActionBlock) || isExpanded
  const expandedSectionRef = useRef(null)
  const didScrollRef = useRef(false)

  useEffect(() => {
    if (!isNvTemplate || !showCommentPhotoBlock) {
      didScrollRef.current = false
      return
    }
    if (expandedSectionRef.current && !didScrollRef.current) {
      didScrollRef.current = true
      expandedSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [isNvTemplate, showCommentPhotoBlock])

  const extras = answerExtras || { comment: '', photo_urls: [] }

  const handleChange = (val) => {
    onChange(question.id, val)
    if (qType === 'yes_no' && (val === 'Yes' || val === 'NA') && onAnswerExtras) {
      onAnswerExtras(question.id, { comment: '', photo_urls: [] })
    }
  }

  const setExtras = (updates) => {
    if (onAnswerExtras) onAnswerExtras(question.id, { ...extras, ...updates })
  }

  const photoId = `photo-${question.id}`
  const photoBlock = (
    <div style={{ marginTop: '0.75rem' }}>
      <label htmlFor={photoId} style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>
        Add photo
        {photoRequired && <span style={{ color: '#ef4444', marginLeft: 4 }}>*</span>}
      </label>
      <PhotoUploadControl
        id={photoId}
        value={extras.photo_urls || []}
        onChange={(urls) => setExtras({ photo_urls: urls })}
        required={photoRequired}
        error={errorPhotos}
        label="Add photo"
      />
    </div>
  )

  const buttonGroup = (optionList, firstButtonId) => (
    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
      {(optionList || []).map((opt, idx) => {
        const label = typeof opt === 'string' ? opt : (opt?.label ?? opt?.value ?? opt)
        const val = typeof opt === 'string' ? opt : (opt?.value ?? opt?.label ?? opt)
        const isSelected = value === val || value === label
        return (
          <button
            key={val}
            type="button"
            id={idx === 0 && firstButtonId ? firstButtonId : undefined}
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
        <label htmlFor={id} style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: '#374151' }}>
          {question.question_text}
          {isRequired && <span style={{ color: '#ef4444', marginLeft: 4 }}>*</span>}
        </label>
        <YesNoNaButtons
          id={id}
          value={yesNoNaValue}
          onChange={(val) => handleChange(val)}
        />
        {showCommentPhotoBlock && (
          <div ref={isNvTemplate ? expandedSectionRef : undefined} style={{ marginTop: '1rem', padding: '1rem', background: showActionBlock ? '#fef3c7' : '#f9fafb', borderRadius: '0.375rem', border: `1px solid ${showActionBlock ? '#f59e0b' : '#e5e7eb'}` }}>
            {showActionBlock && (
              <p style={{ fontWeight: 600, marginBottom: '0.75rem', color: '#92400e' }}>
                Action will be created automatically
              </p>
            )}
            {showComment && (
              <>
                <label htmlFor={`comment-${question.id}`} style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>
                  Resident-friendly message (for poster PDF){commentWhen === 'always' || (commentWhen === 'on_no' && isNo) ? ' ' : ''}
                  {(commentWhen === 'always' || (commentWhen === 'on_no' && isNo)) && <span style={{ color: '#ef4444' }}>*</span>}
                </label>
                <textarea
                  id={`comment-${question.id}`}
                  name={`comment-${question.id}`}
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
            {showActionBlock && question.action_category && (
              <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.5rem', fontStyle: 'italic' }}>
                Action category: {question.action_category}
              </p>
            )}
            {isNvTemplate ? photoBlock : null}
          </div>
        )}
        {!isNvTemplate && photoBlock}
        {error && typeof error === 'string' && <p style={{ marginTop: 4, fontSize: '0.875rem', color: '#ef4444' }}>{error}</p>}
      </div>
    )
  }

  if (qType === 'graded') {
    const gradingOpts = question.grading_options || ['A', 'B', 'C', 'D', 'NA']
    return (
      <div style={{ marginBottom: '1rem' }}>
        <label htmlFor={id} style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: '#374151' }}>
          {question.question_text}
          {question.grading_scheme_name && (
            <span style={{ fontWeight: 400, color: '#6b7280', fontSize: '0.875rem' }}> ({question.grading_scheme_name})</span>
          )}
          {isRequired && <span style={{ color: '#ef4444', marginLeft: 4 }}>*</span>}
        </label>
        {buttonGroup(gradingOpts, id)}
        {photoBlock}
        {error && <p style={{ marginTop: 4, fontSize: '0.875rem', color: '#ef4444' }}>{error}</p>}
      </div>
    )
  }

  if (qType === 'select' || qType === 'single_select') {
    const options = opts.map((o) => (typeof o === 'string' ? o : (o.value ?? o.label ?? o))).filter(Boolean)
    return (
      <div style={{ marginBottom: '1rem' }}>
        <label htmlFor={id} style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: '#374151' }}>
          {question.question_text}
          {isRequired && <span style={{ color: '#ef4444', marginLeft: 4 }}>*</span>}
        </label>
        <select
          id={id}
          name={id}
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
        {photoBlock}
        {error && <p style={{ marginTop: 4, fontSize: '0.875rem', color: '#ef4444' }}>{error}</p>}
      </div>
    )
  }

  if (qType === 'rating') {
    const max = 5
    return (
      <div style={{ marginBottom: '1rem' }}>
        <label htmlFor={id} style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: '#374151' }}>
          {question.question_text}
          {isRequired && <span style={{ color: '#ef4444', marginLeft: 4 }}>*</span>}
        </label>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              id={n === 1 ? id : undefined}
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
        {photoBlock}
        {error && <p style={{ marginTop: 4, fontSize: '0.875rem', color: '#ef4444' }}>{error}</p>}
      </div>
    )
  }

  // text and fallback
  return (
    <div style={{ marginBottom: '1rem' }}>
      <label htmlFor={id} style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: '#374151' }}>
        {question.question_text}
        {isRequired && <span style={{ color: '#ef4444', marginLeft: 4 }}>*</span>}
      </label>
      <input
        id={id}
        name={id}
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
      {photoBlock}
      {error && <p style={{ marginTop: 4, fontSize: '0.875rem', color: '#ef4444' }}>{error}</p>}
    </div>
  )
}

export default function NewInspectionForm({ initialBlocks = [] }) {
  const router = useRouter()
  const [apiPayload, setApiPayload] = useState({ templates: [] })
  const blocks = Array.isArray(initialBlocks) ? initialBlocks : []
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [templateId, setTemplateId] = useState('')
  const [blockRecordId, setBlockRecordId] = useState('')
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')
  const [answers, setAnswers] = useState({})
  const [answerExtras, setAnswerExtras] = useState({})
  const [submitError, setSubmitError] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [validationErrors, setValidationErrors] = useState({})
  const [startingWizard, setStartingWizard] = useState(false)
  const [expandedByQuestionId, setExpandedByQuestionId] = useState({})

  const isNVTemplate = (t) => {
    if (!t) return false
    const key = String(t.template_key ?? '').toLowerCase().trim()
    const name = String(t.name || '').toLowerCase().trim()
    return key === 'nv' || key === 'neighbourhood_voice' || name.includes('neighbourhood voice') || name.includes('neighbourhood voices')
  }

  const startWizard = async () => {
    if (!templateId || !selectedTemplate) return
    setStartingWizard(true)
    setSubmitError(null)
    try {
      const res = await fetch('/api/inspections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          template_id: templateId,
          draft: true,
          title: selectedTemplate.name || 'Neighbourhood Voice Inspection',
          location: location.trim() || undefined,
          description: description.trim() || undefined,
          block_id: blockRecordId || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setSubmitError(data?.error || data?.details || `Request failed (${res.status})`)
        return
      }
      const inspectionId = data.inspectionId ?? data.id
      if (inspectionId) router.push(`/inspections/${inspectionId}/wizard`)
      else setSubmitError('No inspection ID returned')
    } catch (err) {
      setSubmitError(err?.message || 'Failed to start wizard')
    } finally {
      setStartingWizard(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const templatesRes = await fetch('/api/templates', { credentials: 'include' })

        if (!templatesRes.ok) {
          throw new Error(
            templatesRes.status === 503 ? 'Airtable not configured' : 'Failed to load templates'
          )
        }

        const templatesData = await templatesRes.json()

        if (!cancelled) {
          setApiPayload(templatesData)
          const list = templatesData.templates || []
          if (list.length > 0 && !templateId) setTemplateId(list[0].id)
        }
      } catch (err) {
        if (!cancelled) setLoadError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  const templates = apiPayload.templates || []
  const selectedTemplate = templates.find((t) => t.id === templateId)

  const handleAnswer = (questionId, value) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }))
    if (isNVTemplate(selectedTemplate) && value === 'No') {
      setExpandedByQuestionId((prev) => ({ ...prev, [questionId]: true }))
    }
    setValidationErrors((prev) => ({
      ...prev,
      [questionId]: undefined,
      [`${questionId}_comment`]: undefined,
      [`${questionId}_photos`]: undefined,
    }))
  }

  const validate = () => {
    const errs = {}
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
          const photoUrls = Array.isArray(extras.photo_urls) ? extras.photo_urls.filter((u) => typeof u === 'string' && u) : []
          if (photoRequired && photoUrls.length === 0) {
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
        credentials: 'include',
        body: JSON.stringify({
          template_id: templateId,
          block_id: blockRecordId || undefined,
          location: location.trim() || undefined,
          description: description.trim() || undefined,
          answers,
          answer_extras: answerExtras,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg = res.status === 401
          ? 'Please sign in at the top of the page, then try submitting again.'
          : (data.error || data.details || `Request failed (${res.status})`)
        setSubmitError(msg)
        return
      }
      if (data.error) {
        setSubmitError(data.error || data.details || 'Save failed')
        return
      }
      const inspectionId = data.inspectionId ?? data.id
      if (inspectionId) {
        router.push(`/inspections/${inspectionId}`)
      } else {
        setSubmitError('Save reported success but no inspection ID was returned. Check the inspections list.')
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
          ← Back to Manage Inspections
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
          ← Back to Manage Inspections
        </Link>
        <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 'bold' }}>
          Complete Template Inspection
        </h1>
        <p style={{ margin: '0.5rem 0 0 0', color: '#6b7280' }}>
          Formal scored workflow using Airtable templates
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
            name="template_id"
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

        {selectedTemplate && isNVTemplate(selectedTemplate) && (
          <div style={{ marginBottom: '1.5rem', padding: '1.25rem', backgroundColor: '#EFF6FF', border: '1px solid #1D4ED8', borderRadius: '0.5rem' }}>
            <p style={{ margin: '0 0 0.75rem 0', fontSize: '1rem', fontWeight: 500, color: '#1E3A8A' }}>Neighbourhood Voice template</p>
            <p style={{ margin: 0, fontSize: '0.9375rem', color: '#374151', marginBottom: '1rem' }}>
              Use the guided wizard for one question at a time, progress bar, autosave, and a clearer review step.
            </p>
            <button
              type="button"
              onClick={startWizard}
              disabled={startingWizard}
              style={{
                padding: '0.75rem 1.25rem',
                backgroundColor: '#1E3A8A',
                color: '#fff',
                border: 'none',
                borderRadius: '0.5rem',
                fontWeight: 600,
                cursor: startingWizard ? 'not-allowed' : 'pointer',
                fontSize: '0.9375rem',
              }}
            >
              {startingWizard ? 'Starting…' : 'Start guided inspection'}
            </button>
          </div>
        )}

        <div style={{ marginBottom: '1.5rem' }}>
          <label
            htmlFor="block"
            style={{
              display: 'block',
              marginBottom: '0.5rem',
              fontSize: '0.875rem',
              fontWeight: 500,
              color: '#374151',
            }}
          >
            Block (optional)
          </label>
          <select
            id="block"
            name="block"
            value={blockRecordId}
            onChange={(e) => setBlockRecordId(e.target.value)}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '1rem',
              backgroundColor: 'white',
              marginBottom: '0.75rem',
            }}
          >
            <option value="">Select a block (optional)</option>
            {blocks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <label
            htmlFor="location"
            style={{
              display: 'block',
              marginBottom: '0.5rem',
              fontSize: '0.875rem',
              fontWeight: 500,
              color: '#374151',
            }}
          >
            Location note (optional)
          </label>
          <input
            type="text"
            id="location"
            name="location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Stairwell, entrance, or flat number"
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
                      isNvTemplate={isNVTemplate(selectedTemplate)}
                      expandedByQuestionId={expandedByQuestionId}
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
            name="description"
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
