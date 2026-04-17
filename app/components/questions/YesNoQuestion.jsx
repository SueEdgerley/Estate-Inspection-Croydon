'use client'

import { useState, useEffect, useMemo } from 'react'
import { shouldCreateActionOnNo } from '../../../lib/yesno-action-handler'
import { uploadPhoto } from '@/lib/blob-storage'
import {
  normalizeWhenToken,
  computeCaretakerRequiresComment,
  computeCaretakerRequiresPhoto,
} from '@/lib/caretaker-yesno-display'
import { isSpecialSection, isTriggerQuestion } from '@/lib/template-rules'
import { findRecipientQuestion } from '@/lib/caretaker-template'

export default function YesNoQuestion({
  question,
  sectionName,
  inspectionId,
  value,
  onChange,
  errors = {},
  section = null,
  sectionQuestions = [],
  allAnswers = {},
  alwaysShowCaretakerCommentPhoto = false,
  alwaysShowCaretakerRecipient = false,
}) {
  const [answer, setAnswer] = useState(value)
  const [comment, setComment] = useState('')
  const [photos, setPhotos] = useState([])
  const [photoFiles, setPhotoFiles] = useState([])
  const [priority, setPriority] = useState('')
  const [uploading, setUploading] = useState(false)
  const [recipientOptions, setRecipientOptions] = useState([])

  useEffect(() => {
    setAnswer(value)
  }, [value])

  useEffect(() => {
    const c = allAnswers?.[`${question.id}_comment`]
    if (c !== undefined && c !== null && c !== '') setComment(String(c))
  }, [question.id, allAnswers])

  const recipientQ = useMemo(() => {
    if (!sectionQuestions?.length) return null
    return findRecipientQuestion(sectionQuestions)
  }, [sectionQuestions])

  const isThisQuestionTrigger =
    section && isSpecialSection(section) && isTriggerQuestion(question, section)

  useEffect(() => {
    let cancelled = false
    if (!isThisQuestionTrigger || !recipientQ) {
      setRecipientOptions([])
      return () => {
        cancelled = true
      }
    }
    async function load() {
      try {
        const res = await fetch('/api/people', { cache: 'no-store', credentials: 'include' })
        if (!res.ok) return
        const rows = await res.json()
        if (cancelled || !Array.isArray(rows)) return
        setRecipientOptions(
          rows
            .map((p) => ({
              value: p.id != null ? String(p.id) : '',
              label: p.name ? `${p.name}${p.email ? ` (${p.email})` : ''}` : p.email || String(p.id ?? ''),
            }))
            .filter((x) => x.value && x.label)
        )
      } catch {
        /* keep empty */
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [isThisQuestionTrigger, recipientQ])

  const handleAnswerChange = async (newAnswer) => {
    const wasNo = answer === false || answer === 'no' || answer === 'No'
    const wasYes = answer === true || answer === 'yes' || answer === 'Yes'
    const willYes = newAnswer === true || newAnswer === 'yes' || newAnswer === 'Yes'
    const willNo = newAnswer === false || newAnswer === 'no' || newAnswer === 'No'

    setAnswer(newAnswer)
    onChange(question.id, newAnswer)

    const clearDetails = () => {
      setComment('')
      setPhotos([])
      setPhotoFiles([])
      setPriority('')
      onChange(`${question.id}_comment`, '')
      onChange(`${question.id}_priority`, '')
      if (recipientQ) onChange(recipientQ.id, '')
    }

    if (!alwaysShowCaretakerCommentPhoto) {
      if (wasNo && willYes) clearDetails()
      if (wasYes && willNo) clearDetails()
    }
  }

  const handlePhotoUpload = async (e) => {
    const files = Array.from(e.target.files)
    setPhotoFiles((prev) => [...prev, ...files])

    setUploading(true)
    try {
      const uploadedPhotos = []
      for (const file of files) {
        const photoUrl = await uploadPhoto(file, inspectionId, question.id)
        uploadedPhotos.push(photoUrl)
      }
      setPhotos((prev) => [...prev, ...uploadedPhotos])
    } catch (error) {
      console.error('Error uploading photos:', error)
      alert('Failed to upload photos')
    } finally {
      setUploading(false)
    }
  }

  const removePhoto = (index) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index))
    setPhotoFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const isNo = answer === false || answer === 'no' || answer === 'No'
  const isYes = answer === true || answer === 'yes' || answer === 'Yes'
  const nCw = normalizeWhenToken(question.comment_required_when)
  const nPw = normalizeWhenToken(question.photo_required_when)
  const shouldCreateAction = shouldCreateActionOnNo(question)

  const isTriggerYesDetail = isThisQuestionTrigger && isYes

  const requiresComment = isTriggerYesDetail
    ? true
    : computeCaretakerRequiresComment({
        isNo,
        isYes,
        shouldCreateAction,
        nCw,
        question,
        answer,
      })

  const requiresPhoto = isTriggerYesDetail
    ? true
    : computeCaretakerRequiresPhoto({
        isNo,
        isYes,
        shouldCreateAction,
        nPw,
        question,
        answer,
      })

  const legacyNeedsDetailSection =
    answer != null &&
    ((isNo && shouldCreateAction) ||
      (isYes && (nPw === 'on_yes' || nCw === 'on_yes')) ||
      nPw === 'always' ||
      nCw === 'always' ||
      isTriggerYesDetail)

  const needsDetailSection =
    alwaysShowCaretakerCommentPhoto || legacyNeedsDetailSection

  const showCommentField = alwaysShowCaretakerCommentPhoto || requiresComment
  const showPhotoField = alwaysShowCaretakerCommentPhoto || requiresPhoto

  const recipientValue = recipientQ ? allAnswers[recipientQ.id] ?? '' : ''

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

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => handleAnswerChange(true)}
          style={{
            padding: '0.75rem 1.5rem',
            minHeight: 44,
            backgroundColor: answer === true ? '#10b981' : 'white',
            color: answer === true ? 'white' : '#374151',
            border: '1px solid #d1d5db',
            borderRadius: '0.375rem',
            cursor: 'pointer',
            fontWeight: answer === true ? '600' : '500',
          }}
        >
          Yes
        </button>
        <button
          type="button"
          onClick={() => handleAnswerChange(false)}
          style={{
            padding: '0.75rem 1.5rem',
            minHeight: 44,
            backgroundColor: answer === false ? '#ef4444' : 'white',
            color: answer === false ? 'white' : '#374151',
            border: '1px solid #d1d5db',
            borderRadius: '0.375rem',
            cursor: 'pointer',
            fontWeight: answer === false ? '600' : '500',
          }}
        >
          No
        </button>
      </div>

      {needsDetailSection && (
        <div
          style={{
            padding: '1rem',
            backgroundColor: isNo && shouldCreateAction ? '#fef3c7' : '#eff6ff',
            border: `1px solid ${isNo && shouldCreateAction ? '#f59e0b' : '#93c5fd'}`,
            borderRadius: '0.375rem',
            marginTop: '1rem',
          }}
        >
          {isNo && shouldCreateAction && (
            <p style={{ fontWeight: '600', marginBottom: '0.75rem', color: '#92400e' }}>
              Action will be created automatically
            </p>
          )}
          {isTriggerYesDetail && (
            <p style={{ fontWeight: '600', marginBottom: '0.75rem', color: '#1e3a8a' }}>
              Add a comment, at least one photo, and choose who this should be sent to.
            </p>
          )}
          {!isTriggerYesDetail && isYes && (nPw === 'on_yes' || nCw === 'on_yes') && (
            <p style={{ fontWeight: '600', marginBottom: '0.75rem', color: '#1e3a8a' }}>
              Please add the details or photo requested for your Yes answer.
            </p>
          )}

          {showCommentField && (
            <div style={{ marginBottom: '1rem' }}>
              <label
                style={{
                  display: 'block',
                  marginBottom: '0.5rem',
                  fontWeight: '500',
                  fontSize: '0.875rem',
                }}
              >
                Comment {requiresComment && <span style={{ color: '#ef4444' }}>*</span>}
              </label>
              <textarea
                value={comment}
                onChange={(e) => {
                  const newComment = e.target.value
                  setComment(newComment)
                  onChange(`${question.id}_comment`, newComment)
                }}
                placeholder="Please provide details about this issue..."
                required={requiresComment}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: errors[`${question.id}_comment`] ? '1px solid #ef4444' : '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem',
                  fontFamily: 'inherit',
                  minHeight: '80px',
                  resize: 'vertical',
                }}
              />
              {errors[`${question.id}_comment`] && (
                <p style={{ marginTop: '0.25rem', fontSize: '0.875rem', color: '#ef4444' }}>
                  {errors[`${question.id}_comment`]}
                </p>
              )}
            </div>
          )}

          {showPhotoField && (
            <div style={{ marginBottom: '1rem' }}>
              <label
                style={{
                  display: 'block',
                  marginBottom: '0.5rem',
                  fontWeight: '500',
                  fontSize: '0.875rem',
                }}
              >
                Photo(s) {requiresPhoto && <span style={{ color: '#ef4444' }}>*</span>}
                {photos.length > 0 && (
                  <span style={{ marginLeft: '0.5rem', color: '#6b7280', fontWeight: 'normal' }}>
                    ({photos.length} uploaded)
                  </span>
                )}
              </label>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handlePhotoUpload}
                disabled={uploading}
                style={{
                  marginBottom: '0.5rem',
                }}
              />
              {uploading && <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>Uploading…</p>}
              {errors[`${question.id}_photos`] && (
                <p style={{ marginTop: '0.25rem', fontSize: '0.875rem', color: '#ef4444' }}>
                  {errors[`${question.id}_photos`]}
                </p>
              )}

              {photos.length > 0 && (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                    gap: '0.5rem',
                    marginTop: '0.5rem',
                  }}
                >
                  {photos.map((photoUrl, idx) => (
                    <div key={idx} style={{ position: 'relative' }}>
                      <img
                        src={photoUrl}
                        alt={`Photo ${idx + 1}`}
                        style={{
                          width: '100%',
                          height: '150px',
                          objectFit: 'cover',
                          borderRadius: '0.375rem',
                          border: '1px solid #e5e7eb',
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => removePhoto(idx)}
                        style={{
                          position: 'absolute',
                          top: '0.25rem',
                          right: '0.25rem',
                          backgroundColor: '#ef4444',
                          color: 'white',
                          border: 'none',
                          borderRadius: '50%',
                          width: '24px',
                          height: '24px',
                          cursor: 'pointer',
                          fontSize: '0.75rem',
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {isTriggerYesDetail && recipientQ && (
            <div style={{ marginBottom: '1rem' }}>
              <label
                htmlFor={`recipient-${recipientQ.id}`}
                style={{
                  display: 'block',
                  marginBottom: '0.5rem',
                  fontWeight: '500',
                  fontSize: '0.875rem',
                }}
              >
                Who does this need to be sent to? <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <select
                id={`recipient-${recipientQ.id}`}
                value={recipientValue}
                onChange={(e) => onChange(recipientQ.id, e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: errors[recipientQ.id] ? '1px solid #ef4444' : '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: '1rem',
                  backgroundColor: 'white',
                }}
              >
                <option value="">Select a recipient…</option>
                {recipientOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              {errors[recipientQ.id] && (
                <p style={{ marginTop: '0.25rem', fontSize: '0.875rem', color: '#ef4444' }}>{errors[recipientQ.id]}</p>
              )}
            </div>
          )}

          {isNo && shouldCreateAction && question.action_priority && (
            <div style={{ marginBottom: '1rem' }}>
              <label
                style={{
                  display: 'block',
                  marginBottom: '0.5rem',
                  fontWeight: '500',
                  fontSize: '0.875rem',
                }}
              >
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => {
                  const newPriority = e.target.value
                  setPriority(newPriority)
                  onChange(`${question.id}_priority`, newPriority)
                }}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem',
                }}
              >
                <option value="">Select priority...</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          )}

          {isNo && shouldCreateAction && question.action_category && (
            <p
              style={{
                fontSize: '0.875rem',
                color: '#6b7280',
                marginTop: '0.5rem',
                fontStyle: 'italic',
              }}
            >
              Action category: {question.action_category}
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
