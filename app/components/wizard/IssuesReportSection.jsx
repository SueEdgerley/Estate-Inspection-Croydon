'use client'

import { useState } from 'react'
import { NV_TEXTAREA_SURFACE } from '@/lib/nv-resident-field-surfaces'
import PhotoUploadControl from '../questions/PhotoUploadControl'
import { normalizeYesNoNaDisplay } from '../../../lib/question-types'
import { NV_Q24_AIRTABLE_ROWS_188_192 } from '../../../lib/neighbourhood-voice-template-patch'

const YN = ['Yes', 'No', 'NA']

/**
 * Q24 — Issues to report only (Airtable rows 188–192 order).
 * Photo + location appear when the resident answers Yes to either Y/N line.
 */
export default function IssuesReportSection({
  q,
  nv,
  ext,
  onAnswer,
  onExtras,
  btnMinH,
  maxPhotos,
}) {
  const [geoError, setGeoError] = useState(null)
  const rows =
    Array.isArray(q.nv_q24_airtable_rows) && q.nv_q24_airtable_rows.length >= 5
      ? q.nv_q24_airtable_rows
      : NV_Q24_AIRTABLE_ROWS_188_192
  const [intro, labelProps, labelVeh, commentPrompt, photoLocationPrompt] = rows

  const propsVal = normalizeYesNoNaDisplay(ext?.issues_abandoned_properties)
  const vehVal = normalizeYesNoNaDisplay(ext?.issues_abandoned_vehicles)
  const propsYes = propsVal === 'Yes'
  const vehYes = vehVal === 'Yes'
  const anyYes = propsYes || vehYes

  const photoUrls = Array.isArray(ext?.photo_urls) ? ext.photo_urls.filter((u) => typeof u === 'string' && u.trim()) : []
  const hasPhoto = photoUrls.length > 0
  /** After Yes on either Issues line (Q23/Q24 prompts), photo is expected — highlight until provided. */
  const photoRequiredPending = anyYes && !hasPhoto

  const ynBlock = (label, value, fieldBase) => (
    <div style={{ marginBottom: 16 }}>
      <p style={{ fontSize: nv.helperSize, fontWeight: 600, marginBottom: 8, color: nv.text }}>{label}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {YN.map((opt) => {
          const isSel = value === opt
          const fill = opt === 'Yes' ? nv.yesColor : opt === 'No' ? nv.noColor : nv.naColor
          return (
            <button
              key={opt}
              type="button"
              onClick={() => {
                onExtras({ [fieldBase]: opt })
                onAnswer('completed')
              }}
              style={{
                minHeight: btnMinH,
                padding: `12px ${nv.btnPx}px`,
                fontSize: nv.baseSize,
                fontWeight: nv.btnFontWeight,
                backgroundColor: isSel ? fill : nv.cardBg,
                color: isSel ? '#fff' : nv.text,
                border: isSel ? `2px solid ${fill}` : nv.btnUnselectedBorder,
                borderRadius: nv.btnRadius,
                cursor: 'pointer',
                width: '100%',
              }}
            >
              {opt}
            </button>
          )
        })}
      </div>
      <label htmlFor={`${fieldBase}-detail-${q.id}`} style={{ fontSize: nv.metaSize, display: 'block', marginTop: 10, marginBottom: 4, color: nv.muted }}>
        Details
      </label>
      <textarea
        id={`${fieldBase}-detail-${q.id}`}
        value={ext?.[`${fieldBase}_detail`] || ''}
        onChange={(e) => {
          onExtras({ [`${fieldBase}_detail`]: e.target.value })
          onAnswer('completed')
        }}
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
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
      <p style={{ margin: 0, fontSize: nv.baseSize, lineHeight: 1.5, color: nv.text }}>{intro}</p>

      {ynBlock(labelProps, propsVal, 'issues_abandoned_properties')}
      {ynBlock(labelVeh, vehVal, 'issues_abandoned_vehicles')}

      <div>
        <label htmlFor={`iss-comment-${q.id}`} style={{ fontSize: nv.helperSize, fontWeight: 600, display: 'block', marginBottom: 6, color: nv.text }}>
          {commentPrompt}
        </label>
        <textarea
          id={`iss-comment-${q.id}`}
          value={ext?.comment || ''}
          onChange={(e) => {
            onExtras({ comment: e.target.value })
            onAnswer('completed')
          }}
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

      {anyYes ? (
        <div
          role="region"
          aria-label="Photo required when you answer Yes"
          style={{
            marginTop: 4,
            padding: 14,
            borderRadius: nv.btnRadius,
            border: photoRequiredPending ? `2px solid ${nv.primary}` : `1px solid ${nv.cardBorder}`,
            backgroundColor: photoRequiredPending ? (nv.unansweredAmber || '#FEF3C7') : nv.cardBg,
            boxShadow: photoRequiredPending ? '0 0 0 1px rgba(30, 58, 138, 0.12)' : 'none',
            transition: 'border-color 150ms ease, background-color 150ms ease',
          }}
        >
          <p
            style={{
              fontSize: nv.baseSize,
              fontWeight: 700,
              margin: '0 0 6px',
              color: nv.text,
            }}
          >
            Please add a photo
          </p>
          <p style={{ fontSize: nv.metaSize, color: nv.muted, margin: '0 0 10px', lineHeight: 1.45 }}>
            {photoRequiredPending
              ? 'You answered Yes above — a clear photo helps us act on this report.'
              : 'Thank you — you can replace photos below if needed.'}
          </p>
          <p style={{ fontSize: nv.metaSize, color: nv.muted, margin: '0 0 10px' }}>{photoLocationPrompt}</p>
          <PhotoUploadControl
            id={`iss-photo-${q.id}`}
            value={(ext?.photo_urls || []).slice(0, maxPhotos)}
            onChange={(urls) => onExtras({ photo_urls: urls.slice(0, maxPhotos) })}
            label="Add photo"
            multiple={maxPhotos > 1}
          />
        </div>
      ) : null}

      {anyYes ? (
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
                  onExtras({
                    geolocation: {
                      lat: pos.coords.latitude,
                      lng: pos.coords.longitude,
                      accuracy: pos.coords.accuracy,
                    },
                    geo_captured_at: new Date().toISOString(),
                  })
                  onAnswer('completed')
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
            Share approximate location (optional)
          </button>
          {ext?.geolocation && (
            <p style={{ fontSize: nv.metaSize, color: nv.muted, marginTop: 8 }}>
              Saved: {ext.geolocation.lat?.toFixed?.(5) ?? ext.geolocation.lat},{' '}
              {ext.geolocation.lng?.toFixed?.(5) ?? ext.geolocation.lng}
            </p>
          )}
          {geoError && <p style={{ fontSize: nv.metaSize, color: nv.error, marginTop: 6 }}>{geoError}</p>}
        </div>
      ) : null}
    </div>
  )
}
