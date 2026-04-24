'use client'

import PhotoUploadControl from '../questions/PhotoUploadControl'
import { NV_TEXTAREA_SURFACE } from '@/lib/nv-resident-field-surfaces'
import { getGradeButtonStyle } from '@/lib/grading-button-styles'
import { inspectionFieldLabelStyle, inspectionTextareaFieldStyle } from '@/lib/inspection-form-ui'

const DEFAULT_GRADES = ['A', 'B', 'C', 'D', 'NA']

/**
 * Schema-driven graded row: Grade → Comment → Photo (Neighbourhood Voice Q1–Q23).
 */
export default function InspectionQuestion({
  q,
  nv,
  gradeValue,
  ext,
  onSelectGrade,
  onComment,
  onPhotos,
  btnMinH,
  maxPhotos = 1,
  commentFocusRef,
}) {
  const opts =
    (q.grading_options && q.grading_options.length ? q.grading_options : null) ||
    (q.options && Array.isArray(q.options) && q.options.length ? q.options : null) ||
    DEFAULT_GRADES
  const selected = gradeValue != null && gradeValue !== '' ? String(gradeValue) : ''
  const photos = Array.isArray(ext?.photo_urls) ? ext.photo_urls.slice(0, maxPhotos) : []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
      {q.grading_scheme_name ? (
        <p style={{ fontSize: nv.helperSize, color: nv.helperColor, margin: 0 }}>{q.grading_scheme_name}</p>
      ) : null}
      <div>
        <p style={{ ...inspectionFieldLabelStyle, fontWeight: 600, margin: '0 0 8px' }}>Grade</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {opts.map((opt) => {
            const label = typeof opt === 'string' ? opt : String(opt?.value ?? opt?.label ?? opt)
            const isSel = selected === label
            return (
              <button
                key={label}
                type="button"
                onClick={() => onSelectGrade(label)}
                style={getGradeButtonStyle(label, isSel, {
                  minHeight: btnMinH,
                  padding: `12px ${nv.btnPx}px`,
                  fontSize: nv.baseSize,
                  borderRadius: nv.btnRadius,
                })}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <label htmlFor={`nv-std-comment-${q.id}`} style={{ ...inspectionFieldLabelStyle, fontWeight: 600, marginBottom: 6 }}>
          Comment
        </label>
        <textarea
          ref={commentFocusRef}
          id={`nv-std-comment-${q.id}`}
          value={ext?.comment || ''}
          onChange={(e) => onComment(e.target.value)}
          rows={3}
          style={{
            ...NV_TEXTAREA_SURFACE,
            ...inspectionTextareaFieldStyle,
            fontFamily: nv.font,
            minHeight: 72,
          }}
        />
      </div>

      <div>
        <p style={{ ...inspectionFieldLabelStyle, margin: '0 0 8px' }}>Add photo</p>
        <PhotoUploadControl
          id={`nv-std-photo-${q.id}`}
          value={photos}
          onChange={(urls) => onPhotos(urls.slice(0, maxPhotos))}
          label="Add photo"
          multiple={maxPhotos > 1}
        />
      </div>
    </div>
  )
}
