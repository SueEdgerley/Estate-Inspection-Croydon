'use client'

import PhotoUploadControl from '../questions/PhotoUploadControl'
import { NV_TEXTAREA_SURFACE } from '@/lib/nv-resident-field-surfaces'

/**
 * Estate Feedback (Resident Insight): prompts, overall comment, optional photo — no grading.
 */
export default function TextFeedbackSection({
  q,
  nv,
  ext,
  prompts,
  onExtras,
  maxPhotos = 3,
}) {
  const lines = Array.isArray(prompts) && prompts.length ? prompts : []
  const rowValues = ext?.nv_estate_rows && typeof ext.nv_estate_rows === 'object' ? ext.nv_estate_rows : {}

  const setRow = (idx, val) => {
    const next = { ...rowValues, [String(idx)]: val }
    onExtras({ nv_estate_rows: next })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
      <h2
        style={{
          fontSize: 18,
          fontWeight: 600,
          color: nv.text,
          margin: '8px 0 0',
          paddingTop: 16,
          borderTop: `3px solid ${nv.primary || '#1E3A8A'}`,
        }}
      >
        Estate Feedback (Resident Insight)
      </h2>
      {lines.map((line, i) => (
        <div key={i}>
          <label htmlFor={`ef-row-${q.id}-${i}`} style={{ fontSize: nv.helperSize, fontWeight: 600, color: nv.text, display: 'block', marginBottom: 6 }}>
            {line}
          </label>
          <textarea
            id={`ef-row-${q.id}-${i}`}
            value={rowValues[String(i)] || ''}
            onChange={(e) => setRow(i, e.target.value)}
            rows={2}
            style={{
              ...NV_TEXTAREA_SURFACE,
              width: '100%',
              padding: 10,
              border: nv.cardBorder,
              borderRadius: nv.btnRadius,
              fontSize: nv.baseSize,
              fontFamily: nv.font,
            }}
          />
        </div>
      ))}
      <div>
        <label htmlFor={`ef-comment-${q.id}`} style={{ fontSize: nv.helperSize, fontWeight: 600, color: nv.text, display: 'block', marginBottom: 6 }}>
          Overall comment
        </label>
        <textarea
          id={`ef-comment-${q.id}`}
          value={ext?.comment || ''}
          onChange={(e) => onExtras({ comment: e.target.value })}
          rows={3}
          style={{
            ...NV_TEXTAREA_SURFACE,
            width: '100%',
            padding: 10,
            border: nv.cardBorder,
            borderRadius: nv.btnRadius,
            fontSize: nv.baseSize,
            fontFamily: nv.font,
          }}
        />
      </div>
      <div>
        <p style={{ fontSize: nv.helperSize, fontWeight: 600, margin: '0 0 8px', color: nv.text }}>Photo (optional)</p>
        <PhotoUploadControl
          id={`ef-photo-${q.id}`}
          value={(ext?.photo_urls || []).slice(0, maxPhotos)}
          onChange={(urls) => onExtras({ photo_urls: urls.slice(0, maxPhotos) })}
          label="Add photo"
          multiple={maxPhotos > 1}
        />
      </div>
    </div>
  )
}
