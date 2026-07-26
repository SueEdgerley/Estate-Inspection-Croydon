'use client'

import { useEffect } from 'react'
import PhotoUploadControl from '../questions/PhotoUploadControl'
import YesNoNaButtons from '../questions/YesNoNaButtons'
import { getEffectiveQuestionKind, normalizeYesNoNaDisplay } from '../../../lib/question-types'
import { NV_Q24_AIRTABLE_ROWS_188_192 } from '../../../lib/neighbourhood-voice-template-patch'
import InspectionQuestion from './InspectionQuestion'
import IssuesReportSection from './IssuesReportSection'
import SignOffSection from './SignOffSection'
import { NV_TEXTAREA_SURFACE } from '@/lib/nv-resident-field-surfaces'
import { getGradeButtonStyle } from '@/lib/grading-button-styles'
import { shouldCreateActionOnNo } from '@/lib/yesno-action-handler'
import {
  inspectionFieldLabelStyle,
  inspectionFollowUpActionStyle,
  inspectionFollowUpNeutralStyle,
  inspectionTextareaFieldStyle,
} from '@/lib/inspection-form-ui'
import { capActionPhotoUrls, MAX_ACTION_PHOTOS } from '@/lib/action-photos'

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
 * Renders the correct controls for one wizard question (same NV controls as NewInspectionForm where shared).
 */
export default function WizardQuestionFields({
  q,
  sec,
  nv,
  answers,
  extras,
  handleAnswer,
  handleExtras,
  maxPhotos = MAX_ACTION_PHOTOS,
  commentFocusRef,
  prefillResidentName = '',
}) {
  const kind = getEffectiveQuestionKind(q)
  const rawVal = answers[q.id]
  const ext = extras[q.id] || {}
  /** Persist to original Airtable section_id when UI uses synthetic NV sections. */
  const persistSecId = q._nv_answer_section_id || sec.id

  /** Match NewInspectionForm / NV_INLINE (48px) — same control scale on all viewports. */
  const btnMinH = nv.btnMinHeight

  useEffect(() => {
    if (kind !== 'nv_q25' || !prefillResidentName?.trim()) return
    const cur = extras[q.id]?.resident_display_name
    const method = extras[q.id]?.completion_method
    if (method !== undefined && method !== null) return
    if (cur !== undefined && cur !== null && String(cur).trim()) return
    handleExtras(q.id, persistSecId, { resident_display_name: prefillResidentName.trim() })
  }, [kind, q.id, persistSecId, prefillResidentName, extras, handleExtras])

  if (kind === 'nv_plain_textarea') {
    const text = String(rawVal ?? '')
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
        <label htmlFor={`nv-plain-${q.id}`} style={{ fontSize: nv.baseSize, fontWeight: 500, color: nv.text, lineHeight: 1.45 }}>
          {q.resident_wording || q.question_text}
        </label>
        <textarea
          id={`nv-plain-${q.id}`}
          value={text}
          onChange={(e) => handleAnswer(q.id, e.target.value, persistSecId)}
          rows={8}
          style={{
            ...NV_TEXTAREA_SURFACE,
            width: '100%',
            padding: 12,
            border: nv.cardBorder,
            borderRadius: nv.btnRadius,
            fontSize: nv.baseSize,
            fontFamily: nv.font,
            minHeight: 160,
            lineHeight: 1.45,
          }}
        />
      </div>
    )
  }

  if (kind === 'nv_standard') {
    return (
      <InspectionQuestion
        q={q}
        nv={nv}
        gradeValue={rawVal}
        ext={ext}
        btnMinH={btnMinH}
        maxPhotos={1}
        commentFocusRef={commentFocusRef}
        onSelectGrade={(label) => handleAnswer(q.id, label, persistSecId)}
        onComment={(text) => handleExtras(q.id, persistSecId, { comment: text })}
        onPhotos={(urls) => handleExtras(q.id, persistSecId, { photo_urls: urls })}
      />
    )
  }

  if (kind === 'nv_issues_report') {
    return (
      <IssuesReportSection
        q={q}
        nv={nv}
        ext={ext}
        btnMinH={btnMinH}
        maxPhotos={maxPhotos}
        onAnswer={(val) => handleAnswer(q.id, val, persistSecId)}
        onExtras={(updates) => {
          handleExtras(q.id, persistSecId, updates)
          handleAnswer(q.id, 'completed', persistSecId)
        }}
      />
    )
  }

  // Legacy snapshot: old nv_q24 long-form (keep minimal)
  if (kind === 'nv_q24') {
    const rows = Array.isArray(q.nv_q24_instruction_rows) && q.nv_q24_instruction_rows.length
      ? q.nv_q24_instruction_rows
      : NV_Q24_AIRTABLE_ROWS_188_192
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
        <ol style={{ margin: 0, paddingLeft: '1.25rem', fontSize: nv.baseSize, color: nv.text }}>
          {rows.map((line, i) => (
            <li key={i} style={{ marginBottom: 8 }}>{line}</li>
          ))}
        </ol>
        <textarea
          value={ext.comment || ''}
          onChange={(e) => {
            handleExtras(q.id, persistSecId, { comment: e.target.value })
            handleAnswer(q.id, 'completed', persistSecId)
          }}
          rows={3}
          style={{ ...NV_TEXTAREA_SURFACE, width: '100%', padding: 10, border: nv.cardBorder, borderRadius: nv.btnRadius, fontFamily: nv.font }}
        />
      </div>
    )
  }

  if (kind === 'nv_q25') {
    return (
      <SignOffSection
        q={q}
        nv={nv}
        ext={ext}
        sec={sec}
        btnMinH={btnMinH}
        prefillResidentName={prefillResidentName}
        handleExtras={handleExtras}
        handleAnswer={handleAnswer}
      />
    )
  }

  if (kind === 'graded') {
    const opts =
      (q.grading_options && q.grading_options.length ? q.grading_options : null) ||
      (q.options && Array.isArray(q.options) && q.options.length ? q.options : null) ||
      ['A', 'B', 'C', 'D', 'NA']
    const selected = rawVal != null && rawVal !== '' ? String(rawVal) : ''
    const needPhoto = !!q.nv_graded_require_comment_photo
    const showSinglePhoto = !!q.nv_allow_single_photo && !needPhoto
    const needCommentOnly = !!q.nv_graded_require_comment_only
    const showGradedFollowUp = (needPhoto || needCommentOnly) && selected
    const showPhoto = needPhoto && selected
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', minWidth: 0, boxSizing: 'border-box' }}>
        {q.grading_scheme_name && (
          <p style={{ fontSize: nv.helperSize, color: nv.helperColor, margin: 0 }}>{q.grading_scheme_name}</p>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, width: '100%', minWidth: 0 }}>
          {opts.map((opt) => {
            const label = typeof opt === 'string' ? opt : String(opt?.value ?? opt?.label ?? opt)
            const isSel = selected === label
            return (
              <button
                key={label}
                type="button"
                onClick={() => handleAnswer(q.id, label, persistSecId)}
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
        {showGradedFollowUp && (
          <div style={inspectionFollowUpNeutralStyle}>
            <p style={{ ...inspectionFieldLabelStyle, fontWeight: 600, marginBottom: 8 }}>
              {showPhoto ? 'Comment and photo' : 'Comment'}
            </p>
            <label htmlFor={`g-comment-${q.id}`} style={inspectionFieldLabelStyle}>
              Comment
            </label>
            <textarea
              id={`g-comment-${q.id}`}
              value={ext.comment || ''}
              onChange={(e) => handleExtras(q.id, persistSecId, { comment: e.target.value })}
              rows={2}
              style={{
                ...NV_TEXTAREA_SURFACE,
                ...inspectionTextareaFieldStyle,
                marginBottom: showPhoto ? 12 : 0,
                fontFamily: nv.font,
                minHeight: 56,
              }}
            />
            {showPhoto && (
              <>
                <p style={{ ...inspectionFieldLabelStyle, marginTop: 8, marginBottom: 4 }}>
                  Photo (up to {maxPhotos})
                </p>
                <PhotoUploadControl
                  id={`g-photo-${q.id}`}
                  value={capActionPhotoUrls(ext.photo_urls, maxPhotos)}
                  onChange={(urls) =>
                    handleExtras(q.id, persistSecId, { photo_urls: capActionPhotoUrls(urls, maxPhotos) })
                  }
                  label="Add photo"
                  multiple={maxPhotos > 1}
                />
              </>
            )}
          </div>
        )}
        {showSinglePhoto && (
          <div style={{ marginTop: 4 }}>
            <p style={{ ...inspectionFieldLabelStyle, marginBottom: 4 }}>
              Photo (optional, 1 maximum)
            </p>
            <PhotoUploadControl
              id={`nv-single-photo-${q.id}`}
              value={(ext.photo_urls || []).slice(0, 1)}
              onChange={(urls) => handleExtras(q.id, persistSecId, { photo_urls: urls.slice(0, 1) })}
              label="Add photo"
              multiple={false}
            />
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
        onChange={(e) => handleAnswer(q.id, e.target.value, persistSecId)}
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
              onClick={() => handleAnswer(q.id, n, persistSecId)}
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
        value={capActionPhotoUrls(urls, maxPhotos)}
        onChange={(next) => handleAnswer(q.id, stringifyPhotos(capActionPhotoUrls(next, maxPhotos)), persistSecId)}
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
        onChange={(e) => handleAnswer(q.id, e.target.value, persistSecId)}
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
        onChange={(e) => handleAnswer(q.id, e.target.value, persistSecId)}
        rows={4}
        style={{
          ...NV_TEXTAREA_SURFACE,
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
        onChange={(e) => handleAnswer(q.id, e.target.value, persistSecId)}
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

  const ynId = `answer-${q.id}`
  const showActionBlock = isNo && shouldCreateActionOnNo(q)

  return (
    <>
      <YesNoNaButtons
        id={ynId}
        value={value}
        onChange={(opt) => handleAnswer(q.id, opt, persistSecId)}
      />

      {showAlwaysComment && (
        <div style={inspectionFollowUpNeutralStyle}>
          <label htmlFor={`always-${commentId}`} style={inspectionFieldLabelStyle}>
            Comment
          </label>
          <textarea
            id={`always-${commentId}`}
            value={ext.comment || ''}
            onChange={(e) => handleExtras(q.id, persistSecId, { comment: e.target.value })}
            rows={3}
            style={{
              ...NV_TEXTAREA_SURFACE,
              ...inspectionTextareaFieldStyle,
              fontFamily: nv.font,
              minHeight: 72,
            }}
          />
          {isYes && pw === 'on_yes' && (
            <div style={{ marginTop: 12 }}>
              <p style={inspectionFieldLabelStyle}>Photo (required when you answer Yes)</p>
              <PhotoUploadControl
                id={`photo-always-${q.id}`}
                value={capActionPhotoUrls(ext.photo_urls, maxPhotos)}
                onChange={(urls) =>
                  handleExtras(q.id, persistSecId, { photo_urls: capActionPhotoUrls(urls, maxPhotos) })
                }
                label="Add photo"
                multiple
              />
            </div>
          )}
        </div>
      )}

      {isYes && (
        <label
          htmlFor={`raise-issue-${q.id}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginTop: 16,
            fontSize: nv.helperSize,
            cursor: 'pointer',
            color: nv.text,
          }}
        >
          <input
            id={`raise-issue-${q.id}`}
            type="checkbox"
            checked={!!ext.raise_issue}
            onChange={(e) => handleExtras(q.id, persistSecId, { raise_issue: e.target.checked })}
          />
          Raise an issue anyway (e.g. still a concern)
        </label>
      )}

      {followUp && (
        <div style={showActionBlock ? inspectionFollowUpActionStyle : inspectionFollowUpNeutralStyle}>
          {showActionBlock && (
            <p style={{ fontWeight: 600, marginBottom: '0.75rem', color: '#92400e', fontSize: nv.helperSize }}>
              Action will be created automatically
            </p>
          )}
          {!showActionBlock && (
            <p style={{ ...inspectionFieldLabelStyle, fontWeight: 600, marginBottom: 8 }}>
              {isYes && (pw === 'on_yes' || cw === 'on_yes') ? 'Details (Yes)' : 'Add details'}
            </p>
          )}
          {showCommentInFollowUp && (
            <>
              <label htmlFor={commentId} style={inspectionFieldLabelStyle}>
                Comment
              </label>
              <textarea
                ref={commentFocusRef}
                id={commentId}
                name={commentId}
                placeholder="e.g. Please ensure the area is kept clear."
                value={ext.comment || ''}
                onChange={(e) => handleExtras(q.id, persistSecId, { comment: e.target.value })}
                rows={2}
                style={{
                  ...NV_TEXTAREA_SURFACE,
                  ...inspectionTextareaFieldStyle,
                  marginBottom: 12,
                  fontFamily: nv.font,
                  minHeight: 56,
                }}
              />
            </>
          )}
          {showPhotoInFollowUp && !(cw === 'always' && isYes && pw === 'on_yes') && (
            <>
              <p style={{ ...inspectionFieldLabelStyle, marginBottom: 4 }}>
                Photo (up to {maxPhotos})
              </p>
              <div style={{ width: '100%', minHeight: 52 }}>
                <PhotoUploadControl
                  id={`photo-${q.id}`}
                  value={capActionPhotoUrls(ext.photo_urls, maxPhotos)}
                  onChange={(urls) =>
                    handleExtras(q.id, persistSecId, { photo_urls: capActionPhotoUrls(urls, maxPhotos) })
                  }
                  label="Add photo"
                  multiple={true}
                />
              </div>
            </>
          )}
          <label htmlFor={severityId} style={{ ...inspectionFieldLabelStyle, marginTop: 12, marginBottom: 4 }}>
            Severity (optional)
          </label>
          <select
            id={severityId}
            name={severityId}
            value={ext.severity || ''}
            onChange={(e) => handleExtras(q.id, persistSecId, { severity: e.target.value })}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: nv.baseSize,
              minHeight: btnMinH,
              fontFamily: nv.font,
              backgroundColor: '#fff',
            }}
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
