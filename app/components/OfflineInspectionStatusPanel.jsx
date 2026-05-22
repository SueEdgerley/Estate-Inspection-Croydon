'use client'

import {
  formatDraftLastSaved,
  getDraftPhotoStatus,
  hasInspectionDraftContent,
} from '@/lib/offline-inspection-drafts'

const offlineBannerStyle = {
  maxWidth: 800,
  margin: '0 0 1rem',
  padding: '0.9rem 1rem',
  border: '1px solid #f59e0b',
  borderRadius: '0.5rem',
  background: '#fffbeb',
  color: '#92400e',
}

const onlineDraftStyle = {
  maxWidth: 800,
  margin: '0 0 1rem',
  padding: '0.55rem 0.85rem',
  border: '1px solid #cbd5e1',
  borderRadius: '0.5rem',
  background: '#f8fafc',
  color: '#334155',
  fontSize: '0.875rem',
}

const successBannerStyle = {
  maxWidth: 800,
  margin: '0 0 1rem',
  padding: '0.75rem 1rem',
  border: '1px solid #86efac',
  borderRadius: '0.5rem',
  background: '#ecfdf5',
  color: '#166534',
  fontSize: '0.875rem',
}

const smallButtonStyle = {
  padding: '0.45rem 0.7rem',
  border: '1px solid #cbd5e1',
  borderRadius: '0.375rem',
  background: '#fff',
  color: '#1d4ed8',
  fontWeight: 600,
  cursor: 'pointer',
}

export function resolveInspectionStatusMode({
  isOnline,
  activeDraftId,
  activeDraftPayload,
  submitSuccessMessage,
}) {
  if (submitSuccessMessage) return 'submitted'
  if (!isOnline) return 'offline'
  const hasActiveDraft =
    Boolean(activeDraftId) &&
    activeDraftPayload &&
    hasInspectionDraftContent({ submitBody: activeDraftPayload.submitBody || {} })
  if (hasActiveDraft) return 'online-draft'
  return 'hidden'
}

function OtherSavedDraftsList({ drafts, isOnline, isSubmitting, onReopenDraft, onSubmitDraft }) {
  if (!drafts.length) return null
  return (
    <div style={{ display: 'grid', gap: '0.5rem', marginTop: '0.65rem' }}>
      {drafts.map((draft) => (
        <div
          key={draft.id}
          style={{
            display: 'flex',
            gap: '0.5rem',
            flexWrap: 'wrap',
            alignItems: 'center',
            fontSize: '0.875rem',
          }}
        >
          <span style={{ flex: '1 1 220px' }}>
            {draft.label || draft.payload?.templateName || 'Inspection'}
            {draft.updatedAt || draft.createdAt
              ? ` · ${formatDraftLastSaved(draft)}`
              : ''}
          </span>
          <button type="button" onClick={() => onReopenDraft?.(draft)} style={smallButtonStyle}>
            Open saved inspection
          </button>
          <button
            type="button"
            disabled={!isOnline || isSubmitting}
            onClick={() => onSubmitDraft?.(draft)}
            style={{
              ...smallButtonStyle,
              opacity: !isOnline || isSubmitting ? 0.55 : 1,
              cursor: !isOnline || isSubmitting ? 'not-allowed' : 'pointer',
            }}
          >
            Submit inspection
          </button>
        </div>
      ))}
    </div>
  )
}

const storageWarningStyle = {
  margin: '0 0 1rem',
  maxWidth: 800,
  padding: '0.65rem 0.85rem',
  borderRadius: '0.45rem',
  border: '1px solid #fca5a5',
  background: '#fef2f2',
  color: '#991b1b',
  fontSize: '0.875rem',
  lineHeight: 1.45,
}

function StorageWarning({ message, compact = false }) {
  if (!message) return null
  return (
    <p
      style={{
        ...storageWarningStyle,
        margin: compact ? '0.55rem 0 0' : storageWarningStyle.margin,
        maxWidth: compact ? 'none' : storageWarningStyle.maxWidth,
      }}
      role="alert"
    >
      {message}
    </p>
  )
}

export default function OfflineInspectionStatusPanel({
  isOnline,
  isSubmitting = false,
  activeDraftId = '',
  activeDraftPayload = null,
  offlineDrafts = [],
  submitSuccessMessage = '',
  storageWarning = '',
  onReopenDraft,
  onSubmitDraft,
  style,
}) {
  const activeDraftRecord = activeDraftId
    ? offlineDrafts.find((draft) => draft.id === activeDraftId) || null
    : null
  const otherSavedDrafts = offlineDrafts.filter((draft) => draft.id !== activeDraftId)
  const photoStatus = activeDraftPayload ? getDraftPhotoStatus(activeDraftPayload) : null
  const lastSavedAt = activeDraftRecord ? formatDraftLastSaved(activeDraftRecord) : null

  const mode = resolveInspectionStatusMode({
    isOnline,
    activeDraftId,
    activeDraftPayload,
    submitSuccessMessage,
  })

  if (mode === 'hidden') {
    if (!storageWarning) return null
    return (
      <div style={{ ...style }}>
        <StorageWarning message={storageWarning} />
      </div>
    )
  }

  if (mode === 'submitted') {
    return (
      <div style={{ ...successBannerStyle, ...style }} role="status" aria-live="polite">
        <strong>{submitSuccessMessage || 'Inspection submitted successfully'}</strong>
        <StorageWarning message={storageWarning} compact />
      </div>
    )
  }

  if (mode === 'online-draft') {
    return (
      <div style={{ ...onlineDraftStyle, ...style }} role="status" aria-live="polite">
        <strong>Inspection in progress</strong>
        {lastSavedAt ? ` · Draft saved at ${lastSavedAt}` : ' · Draft saved on this phone'}
        {photoStatus?.pendingCount > 0 ? ' · Photos waiting to upload when signal returns' : ''}
        <StorageWarning message={storageWarning} compact />
      </div>
    )
  }

  return (
    <div style={{ ...offlineBannerStyle, ...style }} role="status" aria-live="polite">
      <strong>Inspection saved on this phone</strong>
      <p style={{ margin: '0.4rem 0 0', color: '#475569', fontSize: '0.875rem' }}>
        You can continue working.
        {photoStatus?.pendingCount > 0
          ? ' Photos waiting to upload when signal returns.'
          : ' Photos will upload when signal returns.'}
      </p>
      {lastSavedAt ? (
        <p style={{ margin: '0.35rem 0 0', color: '#475569', fontSize: '0.875rem' }}>
          Last saved at {lastSavedAt}
        </p>
      ) : null}
      <StorageWarning message={storageWarning} compact />
      {otherSavedDrafts.length > 0 ? (
        <OtherSavedDraftsList
          drafts={otherSavedDrafts}
          isOnline={isOnline}
          isSubmitting={isSubmitting}
          onReopenDraft={onReopenDraft}
          onSubmitDraft={onSubmitDraft}
        />
      ) : null}
    </div>
  )
}

export { offlineBannerStyle as offlinePanelStyle, smallButtonStyle as offlineSmallButtonStyle }
