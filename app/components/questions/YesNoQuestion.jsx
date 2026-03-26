'use client'

import { useState, useEffect } from 'react'
import { shouldCreateActionOnNo, requiresPhotoOnNo, requiresCommentOnNo } from '@/lib/yesno-action-handler'
import { uploadPhoto } from '@/lib/blob-storage'

export default function YesNoQuestion({ question, sectionName, inspectionId, value, onChange, errors = {} }) {
  const [answer, setAnswer] = useState(value)
  const [comment, setComment] = useState('')
  const [photos, setPhotos] = useState([])
  const [photoFiles, setPhotoFiles] = useState([])
  const [priority, setPriority] = useState('')
  const [uploading, setUploading] = useState(false)
  const [actionCreated, setActionCreated] = useState(false)

  useEffect(() => {
    setAnswer(value)
  }, [value])

  const handleAnswerChange = async (newAnswer) => {
    setAnswer(newAnswer)
    onChange(question.id, newAnswer)
    
      // If changing from No to Yes, clear comment/photos
      if ((answer === false || answer === 'no' || answer === 'No') && 
          (newAnswer === true || newAnswer === 'yes' || newAnswer === 'Yes')) {
        setComment('')
        setPhotos([])
        setPhotoFiles([])
        setActionCreated(false)
        setPriority('')
        // Clear comment and priority from answers
        onChange(`${question.id}_comment`, '')
        onChange(`${question.id}_priority`, '')
      }
  }

  const handlePhotoUpload = async (e) => {
    const files = Array.from(e.target.files)
    setPhotoFiles(prev => [...prev, ...files])
    
    setUploading(true)
    try {
      const uploadedPhotos = []
      for (const file of files) {
        const photoUrl = await uploadPhoto(file, inspectionId, question.id)
        uploadedPhotos.push(photoUrl)
      }
      setPhotos(prev => [...prev, ...uploadedPhotos])
    } catch (error) {
      console.error('Error uploading photos:', error)
      alert('Failed to upload photos')
    } finally {
      setUploading(false)
    }
  }

  const removePhoto = (index) => {
    setPhotos(prev => prev.filter((_, i) => i !== index))
    setPhotoFiles(prev => prev.filter((_, i) => i !== index))
  }

  const hasExplicitPhotoRule =
    question.photo_required_when === 'always' ||
    question.photo_required_when === 'on_no' ||
    question.require_photo_on_no !== undefined ||
    question.type_includes_photo === true
  const hasExplicitCommentRule =
    question.comment_required_when === 'always' ||
    question.comment_required_when === 'on_no' ||
    question.require_comment_on_no !== undefined

  const requiresPhoto =
    question.photo_required_when === 'always' ||
    (question.photo_required_when === 'on_no' && (answer === false || answer === 'no' || answer === 'No')) ||
    (!question.photo_required_when && hasExplicitPhotoRule && requiresPhotoOnNo(question))
  const requiresComment =
    question.comment_required_when === 'always' ||
    (question.comment_required_when === 'on_no' && (answer === false || answer === 'no' || answer === 'No')) ||
    (!question.comment_required_when && hasExplicitCommentRule && requiresCommentOnNo(question))
  const shouldCreateAction = shouldCreateActionOnNo(question)
  const isNo = answer === false || answer === 'no' || answer === 'No'

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
      
      {/* Yes/No Buttons */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
        <button
          type="button"
          onClick={() => handleAnswerChange(true)}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: answer === true ? '#10b981' : 'white',
            color: answer === true ? 'white' : '#374151',
            border: '1px solid #d1d5db',
            borderRadius: '0.375rem',
            cursor: 'pointer',
            fontWeight: answer === true ? '600' : '500'
          }}
        >
          Yes
        </button>
        <button
          type="button"
          onClick={() => handleAnswerChange(false)}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: answer === false ? '#ef4444' : 'white',
            color: answer === false ? 'white' : '#374151',
            border: '1px solid #d1d5db',
            borderRadius: '0.375rem',
            cursor: 'pointer',
            fontWeight: answer === false ? '600' : '500'
          }}
        >
          No
        </button>
      </div>

      {/* Show requirements when No is selected */}
      {isNo && shouldCreateAction && (
        <div style={{
          padding: '1rem',
          backgroundColor: '#fef3c7',
          border: '1px solid #f59e0b',
          borderRadius: '0.375rem',
          marginTop: '1rem'
        }}>
          <p style={{ fontWeight: '600', marginBottom: '0.75rem', color: '#92400e' }}>
            Action will be created automatically
          </p>

          {/* Comment (required) */}
          {requiresComment && (
            <div style={{ marginBottom: '1rem' }}>
              <label style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontWeight: '500',
                fontSize: '0.875rem'
              }}>
                Comment <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <textarea
                value={comment}
                onChange={(e) => {
                  const newComment = e.target.value
                  setComment(newComment)
                  // Store comment in answers with _comment suffix
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
                  resize: 'vertical'
                }}
              />
              {errors[`${question.id}_comment`] && (
                <p style={{ marginTop: '0.25rem', fontSize: '0.875rem', color: '#ef4444' }}>
                  {errors[`${question.id}_comment`]}
                </p>
              )}
            </div>
          )}

          {/* Photo Upload (required) */}
          {requiresPhoto && (
            <div style={{ marginBottom: '1rem' }}>
              <label style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontWeight: '500',
                fontSize: '0.875rem'
              }}>
                Photo(s) <span style={{ color: '#ef4444' }}>*</span>
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
                  marginBottom: '0.5rem'
                }}
              />
              {uploading && (
                <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>Uploading...</p>
              )}
              {errors[`${question.id}_photos`] && (
                <p style={{ marginTop: '0.25rem', fontSize: '0.875rem', color: '#ef4444' }}>
                  {errors[`${question.id}_photos`]}
                </p>
              )}
              
              {/* Photo Preview */}
              {photos.length > 0 && (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                  gap: '0.5rem',
                  marginTop: '0.5rem'
                }}>
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
                          border: '1px solid #e5e7eb'
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
                          fontSize: '0.75rem'
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

          {/* Priority (optional) */}
          {question.action_priority && (
            <div style={{ marginBottom: '1rem' }}>
              <label style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontWeight: '500',
                fontSize: '0.875rem'
              }}>
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => {
                  const newPriority = e.target.value
                  setPriority(newPriority)
                  // Store priority in answers with _priority suffix
                  onChange(`${question.id}_priority`, newPriority)
                }}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem'
                }}
              >
                <option value="">Select priority...</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          )}

          {/* Action Category Info */}
          {question.action_category && (
            <p style={{
              fontSize: '0.875rem',
              color: '#6b7280',
              marginTop: '0.5rem',
              fontStyle: 'italic'
            }}>
              Action category: {question.action_category}
            </p>
          )}
        </div>
      )}

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
