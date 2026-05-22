'use client'

import { useState, useEffect, useMemo } from 'react'
import { shouldCreateActionOnNo } from '../../../lib/yesno-action-handler'
import { uploadPhoto } from '@/lib/blob-storage'
import {
  normalizeWhenToken,
  computeCaretakerRequiresComment,
  computeCaretakerRequiresPhoto,
} from '@/lib/caretaker-yesno-display'
import { getActionTriggerOn } from '@/lib/template-rules'
import { findRecipientQuestion } from '@/lib/caretaker-template'
import { loadIssueRecipientPeople } from '@/lib/issue-recipient-people'

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
  alwaysShowCaretakerComment = false,
  alwaysShowCaretakerCommentPhoto = false,
  alwaysShowCaretakerRecipient = false,
  caretakerSections12Structured = false,
  estateInspectionForm = false,
  esmInspectionForm = false,
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

  useEffect(() => {
    let cancelled = false
    if (!caretakerSections12Structured || !inspectionId || !question?.id) return
    async function loadExistingPhotos() {
      try {
        const res = await fetch(
          `/api/photos?inspection_id=${encodeURIComponent(inspectionId)}&question_id=${encodeURIComponent(question.id)}`,
          { credentials: 'include' }
        )
        if (!res.ok || cancelled) return
        const rows = await res.json()
        if (cancelled || !Array.isArray(rows)) return
        const urls = rows.map((r) => r.blob_url).filter(Boolean)
        if (urls.length) setPhotos(urls)
      } catch {
        /* ignore */
      }
    }
    loadExistingPhotos()
    return () => {
      cancelled = true
    }
  }, [caretakerSections12Structured, inspectionId, question?.id])

  const recipientQ = useMemo(() => {
    if (!sectionQuestions?.length) return null
    return findRecipientQuestion(sectionQuestions)
  }, [sectionQuestions])

  const triggerOnYes = getActionTriggerOn(question, section) === 'yes'

  useEffect(() => {
    let cancelled = false
    if (!triggerOnYes || !recipientQ) {
      setRecipientOptions([])
      return () => {
        cancelled = true
      }
    }
    async function load() {
      try {
        const mapped = await loadIssueRecipientPeople(fetch)
        if (!cancelled) setRecipientOptions(mapped)
      } catch {
        /* keep empty */
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [triggerOnYes, recipientQ])

  const handleAnswerChange = async (newAnswer) => {
    const wasNo = answer === false || answer === 'no' || answer === 'No'
    const wasYes = answer === true || answer === 'yes' || answer === 'Yes'
    const wasNA =
      answer === 'NA' || answer === 'na' || String(answer || '').toUpperCase() === 'NA'
    const willYes = newAnswer === true || newAnswer === 'yes' || newAnswer === 'Yes'
    const willNo = newAnswer === false || newAnswer === 'no' || newAnswer === 'No'
    const willNA = newAnswer === 'NA' || newAnswer === 'na' || String(newAnswer || '').toUpperCase() === 'NA'

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

    if (!alwaysShowCaretakerComment && !alwaysShowCaretakerCommentPhoto) {
      if (wasNo && willYes) clearDetails()
      if (wasYes && willNo) clearDetails()
      if (wasNA && (willYes || willNo)) clearDetails()
      if ((wasYes || wasNo) && willNA) clearDetails()
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
  const isNA = answer === 'NA' || answer === 'na' || String(answer || '').toUpperCase() === 'NA'
  const isS12 = caretakerSections12Structured
  const nCw = normalizeWhenToken(question.comment_required_when)
  const nPw = normalizeWhenToken(question.photo_required_when)
  const shouldCreateAction = shouldCreateActionOnNo(question)

  const isTriggerYesDetail = triggerOnYes && isYes

  let requiresComment = isTriggerYesDetail
    ? true
    : computeCaretakerRequiresComment({
        isNo,
        isYes,
        shouldCreateAction,
        nCw,
        question,
        answer,
      })

  let requiresPhoto = isTriggerYesDetail
    ? true
    : computeCaretakerRequiresPhoto({
        isNo,
        isYes,
        shouldCreateAction,
        nPw,
        question,
        answer,
      })

  // For ESM sections 11 and 13, suppress default photo/comment controls; only use the dedicated Yes follow-up panel.
  const sectionDisplayNumber = Number(
    section?.esm_display_number ??
      section?.esm_display_order ??
      section?.sort_order ??
      section?.section_order ??
      section?.order ??
      0
  )
  const isEsmSection11Or13 = esmInspectionForm && (sectionDisplayNumber === 11 || sectionDisplayNumber === 13)
  if (isEsmSection11Or13) {
    requiresComment = false
    requiresPhoto = false
  }

  const legacyNeedsDetailSection =
    answer != null &&
    !isNA &&
    ((isNo && shouldCreateAction) ||
      (isYes && (nPw === 'on_yes' || nCw === 'on_yes')) ||
      nPw === 'always' ||
      nCw === 'always' ||
      isTriggerYesDetail)

  const needsDetailSection =
    isS12 ||
    alwaysShowCaretakerComment ||
    alwaysShowCaretakerCommentPhoto ||
    legacyNeedsDetailSection

  const requiresRecipient = isTriggerYesDetail
  const showRecipientField =
    recipientQ &&
    triggerOnYes &&
    (alwaysShowCaretakerRecipient || isTriggerYesDetail)

  const showCommentField =
    isS12 || alwaysShowCaretakerComment || alwaysShowCaretakerCommentPhoto || requiresComment
  const showPhotoField = isS12 || alwaysShowCaretakerCommentPhoto || requiresPhoto

  const recipientValue = recipientQ ? allAnswers[recipientQ.id] ?? '' : ''

  const detailBoxStyle = isS12
    ? {
        marginTop: '1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
      }
    : {
        padding: '1rem',
        backgroundColor: isNo && shouldCreateAction ? '#fef3c7' : '#eff6ff',
        border: `1px solid ${isNo && shouldCreateAction ? '#f59e0b' : '#93c5fd'}`,
        borderRadius: '0.375rem',
        marginTop: '1rem',
      }

  return (
    <div style={{ marginBottom: isS12 ? 0 : '1.5rem' }}>
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
        {isS12 && (
          <button
            type="button"
            onClick={() => handleAnswerChange('NA')}
            style={{
              padding: '0.75rem 1.5rem',
              minHeight: 44,
              backgroundColor: isNA ? '#6366f1' : 'white',
              color: isNA ? 'white' : '#374151',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              cursor: 'pointer',
              fontWeight: isNA ? '600' : '500',
            }}
          >
            NA
          </button>
        )}
      </div>

      {needsDetailSection && (
        <div style={detailBoxStyle}>
          {!isS12 && isNo && shouldCreateAction && (
            <p style={{ fontWeight: '600', marginBottom: '0.75rem', color: '#92400e' }}>
              Action will be created automatically
            </p>
          )}
          {!isS12 && isTriggerYesDetail && (
            <p style={{ fontWeight: '600', marginBottom: '0.75rem', color: '#1e3a8a' }}>
              Add a comment, at least one photo, and choose who this should be sent to.
            </p>
          )}
          {!isS12 &&
            alwaysShowCaretakerRecipient &&
            triggerOnYes &&
            recipientQ &&
            !isYes && (
              <p style={{ fontWeight: '600', marginBottom: '0.75rem', color: '#1e3a8a' }}>
                Add a comment and photos as needed. When you answer Yes, a comment, at least one photo, and a recipient
                are required.
              </p>
            )}
          {!isS12 && !isTriggerYesDetail && isYes && (nPw === 'on_yes' || nCw === 'on_yes') && (
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
                Comment {requiresComment && !isS12 && <span style={{ color: '#ef4444' }}>*</span>}
              </label>
              <textarea
                value={comment}
                onChange={(e) => {
                  const newComment = e.target.value
                  setComment(newComment)
                  onChange(`${question.id}_comment`, newComment)
                }}
                placeholder="Please provide details about this issue..."
                required={requiresComment && !isS12}
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
                Photo(s) {requiresPhoto && !isS12 && <span style={{ color: '#ef4444' }}>*</span>}
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

          {showRecipientField && (
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
                Who does this need to be sent to?{' '}
                {requiresRecipient && <span style={{ color: '#ef4444' }}>*</span>}
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
