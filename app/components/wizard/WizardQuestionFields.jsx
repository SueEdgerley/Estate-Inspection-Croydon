'use client'

import PhotoUploadControl from '../questions/PhotoUploadControl'
import { getEffectiveQuestionKind, normalizeYesNoNaDisplay } from '../../../lib/question-types'

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
}) {
  const kind = getEffectiveQuestionKind(q)
  const rawVal = answers[q.id]
  const ext = extras[q.id] || {}

  const btnMinH = isMobile ? nv.btnMinHeightMobile : nv.btnMinHeight

  if (kind === 'graded') {
    const opts =
      (q.grading_options && q.grading_options.length ? q.grading_options : null) ||
      (q.options && Array.isArray(q.options) && q.options.length ? q.options : null) ||
      ['A', 'B', 'C', 'D', 'NA']
    const selected = rawVal != null && rawVal !== '' ? String(rawVal) : ''
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

  // yes_no: Y / N / NA + issue flow (unchanged layout)
  const value = normalizeYesNoNaDisplay(rawVal)
  const isNo = value === 'No'
  const raiseIssue = ext.raise_issue || isNo
  const commentId = `comment-${q.id}`
  const severityId = `severity-${q.id}`

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
        {YN_OPTIONS.map((opt) => {
          const isSelected = value === opt
          const isYes = opt === 'Yes'
          const isNoOpt = opt === 'No'
          const fillColor = isYes ? nv.yesColor : isNoOpt ? nv.noColor : nv.naColor
          // Mobile: match QuestionCard (template preview) — outlined when unselected, solid fill when selected
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

      {value === 'Yes' && (
        <label htmlFor={`raise-issue-${q.id}`} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, fontSize: nv.helperSize, cursor: 'pointer', color: nv.text }}>
          <input id={`raise-issue-${q.id}`} type="checkbox" checked={!!ext.raise_issue} onChange={(e) => handleExtras(q.id, sec.id, { raise_issue: e.target.checked })} />
          Raise an issue anyway (e.g. still a concern)
        </label>
      )}

      {raiseIssue && (
        <div style={{ marginTop: 16, padding: nv.issuePad, backgroundColor: nv.issueBg, borderLeft: nv.issueBorder, borderRadius: nv.issueRadius }}>
          <span style={{ display: 'inline-block', marginBottom: 8, padding: '2px 8px', fontSize: nv.metaSize, fontWeight: 600, backgroundColor: nv.error, color: '#fff', borderRadius: 999 }}>Issue raised</span>
          <p style={{ fontWeight: 600, marginBottom: 8, fontSize: nv.helperSize, color: nv.text }}>Add details (required for issues)</p>
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
