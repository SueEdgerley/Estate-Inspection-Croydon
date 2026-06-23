'use client'

import { useEffect } from 'react'
import { NV_TEXT_INPUT_SURFACE, NV_TEXTAREA_SURFACE } from '@/lib/nv-resident-field-surfaces'
import PhotoUploadControl from '../questions/PhotoUploadControl'

const COMPLETION_OPTIONS = ['Using the app', 'Using a paper form', 'With assistance from staff']

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Q25 — Sign Off: resident-friendly completion method, paper fallback, date, name, comments, declaration.
 */
export default function SignOffSection({
  q,
  nv,
  ext,
  sec,
  btnMinH,
  prefillResidentName,
  handleExtras,
  handleAnswer,
  onPendingLocalPhotoSaved,
}) {
  const persistSecId = q._nv_answer_section_id || sec.id
  const answerId = q.id
  const completionMethod = ext.completion_method || ''
  const paperPhotoUrls = Array.isArray(ext.paper_form_photo_urls)
    ? ext.paper_form_photo_urls
    : Array.isArray(ext.photo_urls)
      ? ext.photo_urls
      : []
  const inputBase = {
    ...NV_TEXT_INPUT_SURFACE,
    width: '100%',
    minHeight: btnMinH,
    padding: `12px ${nv.btnPx}px`,
    fontSize: nv.baseSize,
    border: nv.cardBorder,
    borderRadius: nv.btnRadius,
    fontFamily: nv.font,
  }
  const labelStyle = { fontSize: nv.helperSize, fontWeight: 700, color: nv.text, marginBottom: 6 }
  const required = <span style={{ color: '#dc2626', marginLeft: 4 }}>*</span>
  const setExtras = (updates) => {
    handleExtras(answerId, persistSecId, updates)
    handleAnswer(answerId, 'completed', persistSecId)
  }

  useEffect(() => {
    if (ext.visit_date) return
    setExtras({ visit_date: todayIsoDate() })
    // Default once per sign-off row; including setExtras would re-run on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answerId])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, width: '100%' }}>
      <p style={{ margin: 0, fontSize: nv.helperSize, fontWeight: 600, color: nv.muted }}>
        Please complete these final details before submitting.
      </p>

      <div>
        <p style={labelStyle}>How was this inspection completed?{required}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {COMPLETION_OPTIONS.map((option) => {
            const selected = completionMethod === option
            return (
              <button
                key={option}
                type="button"
                onClick={() => setExtras({ completion_method: option })}
                style={{
                  minHeight: btnMinH,
                  padding: `12px ${nv.btnPx}px`,
                  borderRadius: nv.btnRadius,
                  border: selected ? `2px solid ${nv.primary}` : nv.btnUnselectedBorder,
                  backgroundColor: selected ? '#E0F2FE' : nv.cardBg,
                  color: nv.text,
                  fontSize: nv.baseSize,
                  fontWeight: selected ? 700 : 600,
                  textAlign: 'left',
                  cursor: 'pointer',
                  boxShadow: selected ? '0 0 0 3px rgba(37,99,235,0.16)' : nv.cardShadow,
                }}
              >
                {option}
              </button>
            )
          })}
        </div>
      </div>

      {completionMethod === 'Using a paper form' ? (
        <div>
          <p style={labelStyle}>Please upload a photo of the completed paper form{required}</p>
          <PhotoUploadControl
            id={`nv25-paper-photo-${q.id}`}
            value={paperPhotoUrls.slice(0, 1)}
            onChange={(urls) => setExtras({ paper_form_photo_urls: urls.slice(0, 1), photo_urls: urls.slice(0, 1) })}
            onPendingLocalPhotoSaved={(urls) => onPendingLocalPhotoSaved?.(urls.slice(0, 1))}
            label="Add photo"
            multiple={false}
          />
        </div>
      ) : null}

      <div>
        <label htmlFor={`nv25-date-${q.id}`} style={{ ...labelStyle, display: 'block' }}>
          Date inspection was completed{required}
        </label>
      <input
        id={`nv25-date-${q.id}`}
        type="date"
        value={ext.visit_date || todayIsoDate()}
        onChange={(e) => setExtras({ visit_date: e.target.value })}
        style={inputBase}
      />
      </div>

      <div>
        <label htmlFor={`nv25-name-${q.id}`} style={{ ...labelStyle, display: 'block' }}>
          Name of resident who completed this inspection{required}
        </label>
      <input
        id={`nv25-name-${q.id}`}
        type="text"
        value={ext.resident_display_name != null ? ext.resident_display_name : ''}
        placeholder="Enter resident name"
        onChange={(e) => setExtras({ resident_display_name: e.target.value })}
        onBlur={(e) => {
          const v = e.target.value.trim()
          if (v) handleAnswer(q.id, 'completed', persistSecId)
        }}
        style={inputBase}
      />
      {prefillResidentName ? (
        <p style={{ fontSize: nv.metaSize, color: nv.muted, margin: 0 }}>
          Suggested from your account — you can change it if someone else is completing this on your behalf.
        </p>
      ) : null}
      </div>

      <div>
        <label htmlFor={`nv25-comments-${q.id}`} style={{ ...labelStyle, display: 'block' }}>
          Additional comments (optional)
        </label>
        <textarea
          id={`nv25-comments-${q.id}`}
          value={ext.final_comments || ''}
          placeholder="Add any final comments here"
          onChange={(e) => setExtras({ final_comments: e.target.value })}
          rows={4}
          style={{
            ...NV_TEXTAREA_SURFACE,
            width: '100%',
            padding: 12,
            border: nv.cardBorder,
            borderRadius: nv.btnRadius,
            fontSize: nv.baseSize,
            fontFamily: nv.font,
            minHeight: 112,
            lineHeight: 1.45,
          }}
        />
      </div>

      <label
        htmlFor={`nv25-signoff-${q.id}`}
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
          padding: 12,
          border: nv.cardBorder,
          borderRadius: nv.btnRadius,
          backgroundColor: nv.cardBg,
          fontSize: nv.helperSize,
          color: nv.text,
          cursor: 'pointer',
        }}
      >
        <input
          id={`nv25-signoff-${q.id}`}
          type="checkbox"
          checked={!!ext.nv_signoff_confirmed}
          onChange={(e) => setExtras({ nv_signoff_confirmed: e.target.checked })}
          style={{ marginTop: 2, flexShrink: 0, width: 22, height: 22 }}
        />
        <span><strong>Declaration{required}</strong><br />I confirm this inspection information is accurate to the best of my knowledge.</span>
      </label>
    </div>
  )
}
