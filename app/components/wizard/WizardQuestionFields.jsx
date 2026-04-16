'use client'

import { useState, useEffect } from 'react'
import PhotoUploadControl from '../questions/PhotoUploadControl'
import { getEffectiveQuestionKind, normalizeYesNoNaDisplay } from '../../../lib/question-types'
import { NV_Q24_INSTRUCTION_ROWS, NV_Q24_GEO_HELPER } from '../../../lib/neighbourhood-voice-template-patch'

const YN_OPTIONS = ['Yes', 'No', 'NA']

function parsePhotoAnswer(raw) {
  if (raw == null || raw === '') return []
  if (Array.isArray(raw)) return raw.filter((u) => typeof u === 'string' && u)
  const s = String(raw).trim()
  try {
    const j = JSON.parse(s)
    if (Array.isArray(j)) return j.filter((u) => typeof u === 'string' && u)
  } catch {
    /* fall through */
  }
  return s ? s.split(',').map((x) => x.trim()).filter(Boolean) : []
}

function stringifyPhotos(urls) {
  const arr = Array.isArray(urls) ? urls.filter((u) => typeof u === 'string' && u) : []
  return arr.length ? JSON.stringify(arr) : ''
}

function normalizeOptionsList(q) {
  const raw = q.options
  if (!raw) return []
  if (Array.isArray(raw)) {
    return raw.map((o) => (typeof o === 'string' ? o : o?.value ?? o?.label ?? '')).filter(Boolean)
  }
  return String(raw)
    .split(/\r?\n|,/)
    .map((p) => p.trim())
    .filter(Boolean)
}

/**
 * Renders the correct controls for one wizard question (mobile or desktop section view).
 */
export default function WizardQuestionFields({
  q,
  sec,
  nv,
  answers,
  extras,
  handleAnswer,
  handleExtras,
  maxPhotos = 3,
  commentFocusRef,
  isMobile,
  prefillResidentName = '',
}) {
  const kind = getEffectiveQuestionKind(q)
  const rawVal = answers[q.id]
  const ext = extras[q.id] || {}

  const btnMinH = isMobile ? nv.btnMinHeightMobile : nv.btnMinHeight
  const [geoError, setGeoError] = useState(null)

  useEffect(() => {
    if (kind !== 'nv_q25' || !prefillResidentName?.trim()) return
    const cur = extras[q.id]?.resident_display_name
    if (cur !== undefined && cur !== null) return
    handleExtras(q.id, sec.id, { resident_display_name: prefillResidentName.trim() })
  }, [kind, q.id, sec.id, prefillResidentName, extras, handleExtras])

  // --- Q24: five instruction rows (Airtable 188–192) + optional geo ---
  if (kind === 'nv_q24') {
    const rows = Array.isArray(q.nv_q24_instruction_rows) && q.nv_q24_instruction_rows.length
      ? q.nv_q24_instruction_rows
      : NV_Q24_INSTRUCTION_ROWS
    const geo = ext.geolocation || null
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
        <p style={{ margin: 0, fontSize: nv.helperSize, color: nv.muted, lineHeight: 1.5 }}>{NV_Q24_GEO_HELPER}</p>
        <ol style={{ margin: 0, paddingLeft: '1.25rem', fontSize: nv.baseSize, color: nv.text, lineHeight: 1.5 }}>
          {rows.map((line, i) => (
            <li key={i} style={{ marginBottom: 8 }}>
              {line}
            </li>
          ))}
        </ol>
        <label htmlFor={`nv24-extra-${q.id}`} style={{ fontSize: nv.helperSize, fontWeight: 600, color: nv.text }}>
          Anything to add? (optional)
        </label>
        <textarea
          id={`nv24-extra-${q.id}`}
          value={ext.comment || ''}
          onChange={(e) => {
            handleExtras(q.id, sec.id, { comment: e.target.value })
            if (!answers[q.id]) handleAnswer(q.id, 'completed', sec.id)
          }}
          rows={3}
          style={{
            width: '100%',
            padding: 10,
            border: nv.cardBorder,
            borderRadius: nv.btnRadius,
            fontSize: nv.baseSize,
            fontFamily: nv.font,
          }}
        />
        <div>
          <button
            type="button"
            onClick={() => {
              setGeoError(null)
              if (!navigator.geolocation) {
                setGeoError('Location is not available in this browser.')
                return
              }
              navigator.geolocation.getCurrentPosition(
                (pos) => {
                  handleExtras(q.id, sec.id, {
                    geolocation: {
                      lat: pos.coords.latitude,
                      lng: pos.coords.longitude,
                      accuracy: pos.coords.accuracy,
                    },
                    geo_captured_at: new Date().toISOString(),
                  })
                  handleAnswer(q.id, 'completed', sec.id)
                },
                (err) => setGeoError(err?.message || 'Could not read location'),
                { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
              )
            }}
            style={{
              minHeight: btnMinH,
              padding: `12px ${nv.btnPx}px`,
              fontSize: nv.baseSize,
              fontWeight: nv.btnFontWeight,
              backgroundColor: nv.primaryLight,
              color: nv.primary,
              border: `1px solid ${nv.primary}`,
              borderRadius: nv.btnRadius,
              cursor: 'pointer',
              width: '100%',
            }}
          >
            Share approximate location (optional — e.g. abandoned vehicles, pin on estate)
          </button>
          {geo && (
            <p style={{ fontSize: nv.metaSize, color: nv.muted, marginTop: 8 }}>
              Saved: {geo.lat?.toFixed?.(5) ?? geo.lat}, {geo.lng?.toFixed?.(5) ?? geo.lng}
              {geo.accuracy != null ? ` (±${Math.round(geo.accuracy)}m)` : ''}
            </p>
          )}
          {geoError && <p style={{ fontSize: nv.metaSize, color: nv.error, marginTop: 6 }}>{geoError}</p>}
        </div>
      </div>
    )
  }

  // --- Q25: sign-off — visit date + display name + confirmation ---
  if (kind === 'nv_q25') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
        <p style={{ margin: 0, fontSize: nv.helperSize, fontWeight: 600, color: nv.text }}>Sign-off</p>
        <label htmlFor={`nv25-date-${q.id}`} style={{ fontSize: nv.helperSize, fontWeight: 600, color: nv.text }}>
          Date of this visit
        </label>
        <input
          id={`nv25-date-${q.id}`}
          type="date"
          value={ext.visit_date || ''}
          onChange={(e) => {
            handleExtras(q.id, sec.id, { visit_date: e.target.value })
            handleAnswer(q.id, 'completed', sec.id)
          }}
          style={{
            width: '100%',
            minHeight: btnMinH,
            padding: `12px ${nv.btnPx}px`,
            fontSize: nv.baseSize,
            border: nv.cardBorder,
            borderRadius: nv.btnRadius,
            fontFamily: nv.font,
          }}
        />
        <label htmlFor={`nv25-name-${q.id}`} style={{ fontSize: nv.helperSize, fontWeight: 600, color: nv.text }}>
          Name as it should appear on the report
        </label>
        <input
          id={`nv25-name-${q.id}`}
          type="text"
          value={ext.resident_display_name != null ? ext.resident_display_name : ''}
          placeholder={prefillResidentName || 'e.g. your name'}
          onChange={(e) => handleExtras(q.id, sec.id, { resident_display_name: e.target.value })}
          onBlur={(e) => {
            const v = e.target.value.trim()
            if (v) handleAnswer(q.id, 'completed', sec.id)
          }}
          style={{
            width: '100%',
            minHeight: btnMinH,
            padding: `12px ${nv.btnPx}px`,
            fontSize: nv.baseSize,
            border: nv.cardBorder,
            borderRadius: nv.btnRadius,
            fontFamily: nv.font,
          }}
        />
        {prefillResidentName ? (
          <p style={{ fontSize: nv.metaSize, color: nv.muted, margin: 0 }}>
            Suggested from your account — you can change it if someone else is completing this on your behalf.
          </p>
        ) : null}
        <label
          htmlFor={`nv25-signoff-${q.id}`}
          style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: nv.helperSize, color: nv.text, cursor: 'pointer', marginTop: 4 }}
        >
          <input
            id={`nv25-signoff-${q.id}`}
            type="checkbox"
            checked={!!ext.nv_signoff_confirmed}
            onChange={(e) => {
              handleExtras(q.id, sec.id, { nv_signoff_confirmed: e.target.checked })
              handleAnswer(q.id, 'completed', sec.id)
            }}
            style={{ marginTop: 3, flexShrink: 0 }}
          />
          <span>I confirm this feedback is accurate to the best of my knowledge.</span>
        </label>
      </div>
    )
  }

  if (kind === 'graded') {
    const opts =
      (q.grading_options && q.grading_options.length ? q.grading_options : null) ||
      (q.options && Array.isArray(q.options) && q.options.length ? q.options : null) ||
      ['A', 'B', 'C', 'D', 'NA']
    const selected = rawVal != null && rawVal !== '' ? String(rawVal) : ''
    const needPhoto = !!q.nv_graded_require_comment_photo
    const needCommentOnly = !!q.nv_graded_require_comment_only
    const showGradedFollowUp = (needPhoto || needCommentOnly) && selected
    const showPhoto = needPhoto && selected
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
        {q.grading_scheme_name && (
          <p style={{ fontSize: nv.helperSize, color: nv.helperColor, margin: 0 }}>{q.grading_scheme_name}</p>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {opts.map((opt) => {
            const label = typeof opt === 'string' ? opt : String(opt?.value ?? opt?.label ?? opt)
            const isSel = selected === label
            return (
              <button
                key={label}
                type="button"
                onClick={() => handleAnswer(q.id, label, sec.id)}
                style={{
                  minHeight: btnMinH,
                  padding: `12px ${nv.btnPx}px`,
                  minWidth: 48,
                  fontSize: nv.baseSize,
                  fontWeight: nv.btnFontWeight,
                  backgroundColor: isSel ? nv.primary : nv.cardBg,
                  color: isSel ? '#fff' : nv.text,
                  border: isSel ? `2px solid ${nv.primary}` : nv.btnUnselectedBorder,
                  borderRadius: nv.btnRadius,
                  cursor: 'pointer',
                  transition: nv.transition,
                }}
              >
                {label}
              </button>
            )
          })}
        </div>
        {showGradedFollowUp && (
          <div style={{ marginTop: 8, padding: nv.issuePad, backgroundColor: '#F9FAFB', borderRadius: nv.issueRadius, border: nv.cardBorder }}>
            <p style={{ fontSize: nv.helperSize, fontWeight: 600, marginBottom: 8, color: nv.text }}>
              {showPhoto ? 'Comment and photo' : 'Comment'}
            </p>
            <label htmlFor={`g-comment-${q.id}`} style={{ display: 'block', fontSize: nv.helperSize, marginBottom: 4 }}>
              Comment
            </label>
            <textarea
              id={`g-comment-${q.id}`}
              value={ext.comment || ''}
              onChange={(e) => handleExtras(q.id, sec.id, { comment: e.target.value })}
              rows={2}
              style={{
                width: '100%',
                padding: 10,
                border: nv.cardBorder,
                borderRadius: 8,
                fontSize: nv.baseSize,
                marginBottom: showPhoto ? 12 : 0,
                fontFamily: nv.font,
                minHeight: 56,
              }}
            />
            {showPhoto && (
              <>
                <p style={{ fontSize: nv.helperSize, marginBottom: 4, color: nv.text, marginTop: 8 }}>Photo (up to {maxPhotos})</p>
                <PhotoUploadControl
                  id={`g-photo-${q.id}`}
                  value={(ext.photo_urls || []).slice(0, maxPhotos)}
                  onChange={(urls) => handleExtras(q.id, sec.id, { photo_urls: urls.slice(0, maxPhotos) })}
                  label="Add photo"
                  multiple
                />
              </>
            )}
          </div>
        )}
      </div>
    )
  }

  if (kind === 'single_select' || kind === 'select') {
    const options = normalizeOptionsList(q)
    const sel = rawVal != null ? String(rawVal) : ''
    return (
      <select
        id={`answer-${q.id}`}
        value={sel}
        onChange={(e) => handleAnswer(q.id, e.target.value, sec.id)}
        style={{
          width: '100%',
          minHeight: btnMinH,
          padding: `12px ${nv.btnPx}px`,
          fontSize: nv.baseSize,
          border: nv.cardBorder,
          borderRadius: nv.btnRadius,
          backgroundColor: nv.cardBg,
          fontFamily: nv.font,
        }}
      >
        <option value="">Select…</option>
        {(options.length ? options : ['—']).map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    )
  }

  if (kind === 'rating') {
    const max = 5
    const num = typeof rawVal === 'number' ? rawVal : parseInt(String(rawVal), 10)
    const selected = Number.isFinite(num) && num >= 1 && num <= max ? num : null
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {Array.from({ length: max }, (_, i) => i + 1).map((n) => {
          const isSel = selected === n
          return (
            <button
              key={n}
              type="button"
              onClick={() => handleAnswer(q.id, n, sec.id)}
              style={{
                minHeight: btnMinH,
                minWidth: 48,
                padding: `12px ${nv.btnPx}px`,
                fontSize: nv.baseSize,
                fontWeight: nv.btnFontWeight,
                backgroundColor: isSel ? nv.primary : nv.cardBg,
                color: isSel ? '#fff' : nv.text,
                border: isSel ? `2px solid ${nv.primary}` : nv.btnUnselectedBorder,
                borderRadius: nv.btnRadius,
                cursor: 'pointer',
              }}
            >
              {n}
            </button>
          )
        })}
      </div>
    )
  }

  if (kind === 'photo') {
    const urls = parsePhotoAnswer(rawVal)
    return (
      <PhotoUploadControl
        id={`photo-${q.id}`}
        value={urls.slice(0, maxPhotos)}
        onChange={(next) => handleAnswer(q.id, stringifyPhotos(next), sec.id)}
        label="Add photo"
        multiple={maxPhotos > 1}
      />
    )
  }

  if (kind === 'number') {
    const n = rawVal != null && rawVal !== '' ? String(rawVal) : ''
    return (
      <input
        id={`answer-${q.id}`}
        type="number"
        value={n}
        onChange={(e) => handleAnswer(q.id, e.target.value, sec.id)}
        style={{
          width: '100%',
          minHeight: btnMinH,
          padding: `12px ${nv.btnPx}px`,
          fontSize: nv.baseSize,
          border: nv.cardBorder,
          borderRadius: nv.btnRadius,
          fontFamily: nv.font,
        }}
      />
    )
  }

  if (kind === 'long_text') {
    return (
      <textarea
        id={`answer-${q.id}`}
        value={rawVal != null ? String(rawVal) : ''}
        onChange={(e) => handleAnswer(q.id, e.target.value, sec.id)}
        rows={4}
        style={{
          width: '100%',
          padding: 12,
          fontSize: nv.baseSize,
          border: nv.cardBorder,
          borderRadius: nv.btnRadius,
          fontFamily: nv.font,
          minHeight: 100,
        }}
      />
    )
  }

  if (kind !== 'yes_no') {
    return (
      <input
        id={`answer-${q.id}`}
        type="text"
        value={rawVal != null ? String(rawVal) : ''}
        onChange={(e) => handleAnswer(q.id, e.target.value, sec.id)}
        style={{
          width: '100%',
          minHeight: btnMinH,
          padding: `12px ${nv.btnPx}px`,
          fontSize: nv.baseSize,
          border: nv.cardBorder,
          borderRadius: nv.btnRadius,
          fontFamily: nv.font,
        }}
      />
    )
  }

  const value = normalizeYesNoNaDisplay(rawVal)
  const isNo = value === 'No'
  const isYes = value === 'Yes'
  const cw = q.comment_required_when
  const pw = q.photo_required_when

  const showAlwaysComment = cw === 'always' && !!value
  const followUpRaw =
    !!value &&
    (ext.raise_issue ||
      (isYes && (pw === 'on_yes' || cw === 'on_yes')) ||
      (isNo && (pw === 'on_no' || cw === 'on_no')) ||
      pw === 'always')
  const followUp =
    followUpRaw &&
    !(cw === 'always' && isYes && pw === 'on_yes' && !ext.raise_issue)

  const showPhotoInFollowUp =
    followUp &&
    (pw === 'always' ||
      (isYes && pw === 'on_yes') ||
      (isNo && pw === 'on_no') ||
      ext.raise_issue)

  const showCommentInFollowUp = followUp && cw !== 'always'

  const commentId = `comment-${q.id}`
  const severityId = `severity-${q.id}`

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
        {YN_OPTIONS.map((opt) => {
          const isSelected = value === opt
          const isYesOpt = opt === 'Yes'
          const isNoOpt = opt === 'No'
          const fillColor = isYesOpt ? nv.yesColor : isNoOpt ? nv.noColor : nv.naColor
          const bg = isSelected ? fillColor : nv.cardBg
          const border = isSelected
            ? `2px solid ${fillColor}`
            : isMobile
              ? '2px solid #E5E7EB'
              : nv.btnUnselectedBorder
          const color = isSelected ? '#fff' : nv.text
          return (
            <button
              key={opt}
              type="button"
              id={`answer-${q.id}-${opt}`}
              onClick={() => handleAnswer(q.id, opt, sec.id)}
              style={{
                minHeight: btnMinH,
                padding: isMobile ? '14px 16px' : `12px ${nv.btnPx}px`,
                fontSize: isMobile ? 16 : nv.baseSize,
                fontWeight: nv.btnFontWeight,
                backgroundColor: bg,
                color,
                border,
                borderRadius: nv.btnRadius,
                cursor: 'pointer',
                textAlign: 'center',
                transition: nv.transition,
                width: '100%',
              }}
            >
              {opt}
            </button>
          )
        })}
      </div>

      {showAlwaysComment && (
        <div style={{ marginTop: 16 }}>
          <label htmlFor={`always-${commentId}`} style={{ display: 'block', fontSize: nv.helperSize, marginBottom: 6, color: nv.text }}>
            Comment
          </label>
          <textarea
            id={`always-${commentId}`}
            value={ext.comment || ''}
            onChange={(e) => handleExtras(q.id, sec.id, { comment: e.target.value })}
            rows={3}
            style={{
              width: '100%',
              padding: 10,
              border: nv.cardBorder,
              borderRadius: 8,
              fontSize: nv.baseSize,
              fontFamily: nv.font,
              minHeight: 72,
            }}
          />
          {isYes && pw === 'on_yes' && (
            <div style={{ marginTop: 12 }}>
              <p style={{ fontSize: nv.helperSize, marginBottom: 6, color: nv.text }}>Photo (required when you answer Yes)</p>
              <PhotoUploadControl
                id={`photo-always-${q.id}`}
                value={(ext.photo_urls || []).slice(0, maxPhotos)}
                onChange={(urls) => handleExtras(q.id, sec.id, { photo_urls: urls.slice(0, maxPhotos) })}
                label="Add photo"
                multiple
              />
            </div>
          )}
        </div>
      )}

      {isYes && (
        <label htmlFor={`raise-issue-${q.id}`} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, fontSize: nv.helperSize, cursor: 'pointer', color: nv.text }}>
          <input id={`raise-issue-${q.id}`} type="checkbox" checked={!!ext.raise_issue} onChange={(e) => handleExtras(q.id, sec.id, { raise_issue: e.target.checked })} />
          Raise an issue anyway (e.g. still a concern)
        </label>
      )}

      {followUp && (
        <div style={{ marginTop: 16, padding: nv.issuePad, backgroundColor: nv.issueBg, borderLeft: nv.issueBorder, borderRadius: nv.issueRadius }}>
          <span style={{ display: 'inline-block', marginBottom: 8, padding: '2px 8px', fontSize: nv.metaSize, fontWeight: 600, backgroundColor: nv.error, color: '#fff', borderRadius: 999 }}>
            {isYes && (pw === 'on_yes' || cw === 'on_yes') ? 'Details (Yes)' : 'Issue raised'}
          </span>
          <p style={{ fontWeight: 600, marginBottom: 8, fontSize: nv.helperSize, color: nv.text }}>Add details</p>
          {showCommentInFollowUp && (
            <>
              <label htmlFor={commentId} style={{ display: 'block', fontSize: nv.helperSize, marginBottom: 4, color: nv.text }}>Comment</label>
              <textarea
                ref={commentFocusRef}
                id={commentId}
                name={commentId}
                placeholder="e.g. Please ensure the area is kept clear."
                value={ext.comment || ''}
                onChange={(e) => handleExtras(q.id, sec.id, { comment: e.target.value })}
                rows={2}
                style={{ width: '100%', padding: 10, border: nv.cardBorder, borderRadius: 8, fontSize: nv.baseSize, marginBottom: 12, fontFamily: nv.font, minHeight: 56 }}
              />
            </>
          )}
          {showPhotoInFollowUp && !(cw === 'always' && isYes && pw === 'on_yes') && (
            <>
              <p style={{ fontSize: nv.helperSize, marginBottom: 4, color: nv.text }}>Photo (up to {maxPhotos})</p>
              <div style={{ width: '100%', minHeight: 52 }}>
                <PhotoUploadControl
                  id={`photo-${q.id}`}
                  value={(ext.photo_urls || []).slice(0, maxPhotos)}
                  onChange={(urls) => handleExtras(q.id, sec.id, { photo_urls: urls.slice(0, maxPhotos) })}
                  label="Add photo"
                  multiple={true}
                />
              </div>
            </>
          )}
          <label htmlFor={severityId} style={{ display: 'block', fontSize: nv.helperSize, marginTop: 12, marginBottom: 4, color: nv.text }}>Severity (optional)</label>
          <select
            id={severityId}
            name={severityId}
            value={ext.severity || ''}
            onChange={(e) => handleExtras(q.id, sec.id, { severity: e.target.value })}
            style={{ width: '100%', padding: 10, border: nv.cardBorder, borderRadius: 8, fontSize: nv.helperSize, minHeight: btnMinH, fontFamily: nv.font }}
          >
            <option value="">Optional</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
      )}
    </>
  )
}
