'use client'

import { NV_TEXT_INPUT_SURFACE } from '@/lib/nv-resident-field-surfaces'

/**
 * Q25 — Sign-off: date, display name, confirmation.
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
}) {
  const persistSecId = q._nv_answer_section_id || sec.id
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
          handleExtras(q.id, persistSecId, { visit_date: e.target.value })
          handleAnswer(q.id, 'completed', persistSecId)
        }}
        style={{
          ...NV_TEXT_INPUT_SURFACE,
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
        onChange={(e) => handleExtras(q.id, persistSecId, { resident_display_name: e.target.value })}
        onBlur={(e) => {
          const v = e.target.value.trim()
          if (v) handleAnswer(q.id, 'completed', persistSecId)
        }}
        style={{
          ...NV_TEXT_INPUT_SURFACE,
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
            handleExtras(q.id, persistSecId, { nv_signoff_confirmed: e.target.checked })
            handleAnswer(q.id, 'completed', persistSecId)
          }}
          style={{ marginTop: 3, flexShrink: 0 }}
        />
        <span>I confirm this feedback is accurate to the best of my knowledge.</span>
      </label>
    </div>
  )
}
