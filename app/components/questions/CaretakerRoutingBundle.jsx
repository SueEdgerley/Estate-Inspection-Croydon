'use client'

import PhotoUploadControl from '@/app/components/questions/PhotoUploadControl'

/**
 * Section footer: comment, photo, recipient — one block (canonical abandoned vehicles Q7).
 */
export default function CaretakerRoutingBundle({
  question,
  answerExtras = {},
  onAnswerExtras,
  errorComment,
  errorPhotos,
  textareaStyle = {},
  peopleOptions = [],
  mobileStacked = false,
}) {
  const ex = answerExtras || {}
  const set = (updates) => onAnswerExtras?.(question.id, { ...ex, ...updates })

  return (
    <div
      style={{
        marginTop: '1rem',
        padding: '1rem',
        border: '1px solid #e5e7eb',
        borderRadius: mobileStacked ? '0.75rem' : '0.5rem',
        backgroundColor: '#f9fafb',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <p style={{ fontWeight: 600, marginBottom: '0.75rem', fontSize: '0.875rem', color: '#374151' }}>Comment, photo, and recipient</p>
      <label htmlFor={`route-comment-${question.id}`} style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>
        Comment
      </label>
      <textarea
        id={`route-comment-${question.id}`}
        value={ex.comment || ''}
        onChange={(e) => set({ comment: e.target.value })}
        rows={3}
        style={{
          ...textareaStyle,
          width: '100%',
          padding: mobileStacked ? '0.75rem' : '0.5rem',
          border: errorComment ? '1px solid #ef4444' : '1px solid #d1d5db',
          borderRadius: '0.375rem',
          fontSize: mobileStacked ? '1rem' : '0.875rem',
          fontFamily: 'inherit',
          marginBottom: '0.75rem',
          minHeight: mobileStacked ? 96 : undefined,
          boxSizing: 'border-box',
        }}
      />
      {errorComment && <p style={{ marginTop: 4, fontSize: '0.875rem', color: '#ef4444' }}>{errorComment}</p>}
      <p style={{ fontSize: '0.875rem', marginBottom: '0.5rem', color: '#374151' }}>Photo</p>
      <PhotoUploadControl
        id={`route-photo-${question.id}`}
        value={ex.photo_urls || []}
        onChange={(urls) => set({ photo_urls: urls })}
        label="Add photo"
        error={errorPhotos}
        multiple
        mobileStacked={mobileStacked}
      />
      <label htmlFor={`route-recipient-${question.id}`} style={{ display: 'block', marginTop: '0.75rem', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>
        Recipient
      </label>
      <select
        id={`route-recipient-${question.id}`}
        value={ex.recipient_person_id || ''}
        onChange={(e) => set({ recipient_person_id: e.target.value })}
        style={{
          width: '100%',
          padding: '0.75rem',
          border: '1px solid #d1d5db',
          borderRadius: '0.375rem',
          fontSize: '1rem',
          backgroundColor: 'white',
          minHeight: mobileStacked ? 48 : undefined,
          boxSizing: 'border-box',
        }}
      >
        <option value="">Select recipient…</option>
        {peopleOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  )
}
