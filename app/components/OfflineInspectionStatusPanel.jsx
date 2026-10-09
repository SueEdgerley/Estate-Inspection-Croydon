'use client'

import { formatDraftLastSaved, getDraftPhotoStatus } from '@/lib/offline-inspection-drafts'
import { resolveInspectionStatusMode } from '@/lib/inspection-status-mode'
import SavedInspectionDraftsPanel from '@/app/components/SavedInspectionDraftsPanel'

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

export { resolveInspectionStatusMode } from '@/lib/inspection-status-mode'

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
  blocks = [],
  submitSuccessMessage = '',
  storageWarning = '',
  onReopenDraft,
  onSubmitDraft,
  style,
  draftsTitle = 'Saved inspections on this phone',
}) {
  const activeDraftRecord = activeDraftId
    ? offlineDrafts.find((draft) => draft.id === activeDraftId) || null
    : null
  const photoStatus = activeDraftPayload ? getDraftPhotoStatus(activeDraftPayload) : null
  const lastSavedAt = activeDraftRecord ? formatDraftLastSaved(activeDraftRecord) : null

  const mode = resolveInspectionStatusMode({
    isOnline,
    activeDraftId,
    activeDraftPayload,
    submitSuccessMessage,
  })

  const savedDrafts = (
    <SavedInspectionDraftsPanel
      drafts={offlineDrafts}
      blocks={blocks}
      isOnline={isOnline}
      isSubmitting={isSubmitting}
      activeDraftId={activeDraftId}
      onResumeDraft={onReopenDraft}
      onSubmitDraft={onSubmitDraft}
      showSubmit={false}
      title={draftsTitle}
      intro="These inspections are saved on this phone only until you see Inspection submitted successfully. Resume opens that draft and does not delete the others."
      style={{ maxWidth: 'none', margin: mode === 'hidden' && !storageWarning ? '0 0 1rem' : '0.75rem 0 0' }}
    />
  )

  if (mode === 'hidden') {
    if (!storageWarning) {
      return savedDrafts
    }
    return (
      <div style={{ ...style }}>
        <StorageWarning message={storageWarning} />
        {savedDrafts}
      </div>
    )
  }

  if (mode === 'submitted') {
    return (
      <div style={{ ...style }}>
        <div style={{ ...successBannerStyle, maxWidth: 'none', margin: 0 }} role="status" aria-live="polite">
          <strong>{submitSuccessMessage || 'Inspection submitted successfully'}</strong>
          <StorageWarning message={storageWarning} compact />
        </div>
        {savedDrafts}
      </div>
    )
  }

  if (mode === 'online-draft') {
    return (
      <div style={{ ...style }}>
        <div style={{ ...onlineDraftStyle, maxWidth: 'none', margin: 0 }} role="status" aria-live="polite">
          <strong>Saved on this phone – not submitted</strong>
          {lastSavedAt ? ` · last saved at ${lastSavedAt}` : ''}
          {photoStatus?.pendingCount > 0 ? ' · some photographs have not uploaded yet' : ''}
          <StorageWarning message={storageWarning} compact />
        </div>
        {savedDrafts}
      </div>
    )
  }

  return (
    <div style={{ ...offlineBannerStyle, ...style }} role="status" aria-live="polite">
      <strong>Saved on this phone – not submitted</strong>
      <p style={{ margin: '0.4rem 0 0', color: '#475569', fontSize: '0.875rem' }}>
        No internet connection. You can keep working. This inspection stays on this phone until you have
        signal, then tap Save inspection.
        {photoStatus?.pendingCount > 0 ? ' Photographs will upload when the connection returns.' : ''}
      </p>
      {lastSavedAt ? (
        <p style={{ margin: '0.35rem 0 0', color: '#475569', fontSize: '0.875rem' }}>
          Last saved at {lastSavedAt}
        </p>
      ) : null}
      <StorageWarning message={storageWarning} compact />
      {savedDrafts}
    </div>
  )
}

export { offlineBannerStyle as offlinePanelStyle }
