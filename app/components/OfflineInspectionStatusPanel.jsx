'use client'

import {
  formatDraftLastSaved,
  getDraftConnectionStatus,
  getDraftNextStep,
  getDraftPhotoStatus,
  getOfflineDraftStatusSummary,
  hasInspectionDraftContent,
} from '@/lib/offline-inspection-drafts'

const panelStyle = {
  maxWidth: 800,
  margin: '0 0 1rem',
  padding: '0.9rem 1rem',
  border: '1px solid #f59e0b',
  borderRadius: '0.5rem',
  background: '#fffbeb',
  color: '#92400e',
}

const cardStyle = {
  marginTop: '0.75rem',
  padding: '0.75rem 0.85rem',
  borderRadius: '0.45rem',
  border: '1px solid #fcd34d',
  background: '#fff',
  color: '#1f2937',
}

const listStyle = {
  margin: '0.45rem 0 0',
  paddingLeft: '1.1rem',
  fontSize: '0.875rem',
  lineHeight: 1.55,
  color: '#334155',
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

function InspectionStatusCard({ title, summary, actions, isSubmitting, isOnline }) {
  return (
    <div style={cardStyle}>
      {title ? (
        <strong style={{ display: 'block', fontSize: '0.925rem', color: '#92400e' }}>{title}</strong>
      ) : null}
      <p style={{ margin: '0.35rem 0 0', fontSize: '0.875rem', fontWeight: 600, color: '#0f172a' }}>
        Inspection status
      </p>
      <ul style={listStyle}>
        <li>{summary.answersLabel}</li>
        <li>{summary.photoStatus.label}</li>
        {!isOnline && summary.connectionStatus.key !== 'upload-waiting' ? (
          <li>Waiting for internet connection</li>
        ) : null}
        <li>{summary.connectionStatus.label}</li>
        {summary.lastSavedAt ? <li>Last saved at {summary.lastSavedAt}</li> : null}
      </ul>
      <p style={{ margin: '0.55rem 0 0', fontSize: '0.875rem', color: '#475569' }}>
        <strong style={{ color: '#334155' }}>What to do next:</strong> {summary.nextStep}
      </p>
      {actions ? (
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>{actions}</div>
      ) : null}
      {isSubmitting ? (
        <p style={{ margin: '0.55rem 0 0', fontSize: '0.8125rem', color: '#64748b' }}>Submitting…</p>
      ) : null}
    </div>
  )
}

function ActiveInspectionStatusCard({ isOnline, activeDraftPayload, activeDraftRecord, isSubmitting }) {
  if (!hasInspectionDraftContent({ submitBody: activeDraftPayload?.submitBody || {} })) return null

  const photoStatus = getDraftPhotoStatus(activeDraftPayload)
  const connectionStatus = getDraftConnectionStatus({
    isOnline,
    draftStatus: activeDraftRecord?.status || 'unsent',
    hasAnswers: true,
    hasPendingPhotos: photoStatus.pendingCount > 0,
  })
  const summary = {
    answersLabel: 'Answers saved on this phone',
    photoStatus,
    connectionStatus,
    lastSavedAt: activeDraftRecord ? formatDraftLastSaved(activeDraftRecord) : null,
    nextStep: getDraftNextStep({ isOnline, photoStatusKey: photoStatus.key }),
  }

  return (
    <InspectionStatusCard
      title="Inspection saved on this phone"
      summary={summary}
      isSubmitting={isSubmitting}
      isOnline={isOnline}
    />
  )
}

export default function OfflineInspectionStatusPanel({
  isOnline,
  isSubmitting = false,
  offlineNotice = '',
  offlineDrafts = [],
  activeDraftId = '',
  activeDraftPayload = null,
  onReopenDraft,
  onSubmitDraft,
  style,
}) {
  const activeDraftRecord = activeDraftId
    ? offlineDrafts.find((draft) => draft.id === activeDraftId) || null
    : null
  const savedDrafts = offlineDrafts.filter((draft) => draft.id !== activeDraftId)
  const hasActiveDraftContent =
    activeDraftPayload && hasInspectionDraftContent({ submitBody: activeDraftPayload.submitBody || {} })
  const showActiveCard = hasActiveDraftContent && (!isOnline || Boolean(activeDraftId))

  if (!showActiveCard && !offlineDrafts.length && !offlineNotice) return null

  return (
    <div style={{ ...panelStyle, ...style }}>
      <strong>
        {!isOnline ? 'Inspection saved on this phone' : 'Inspections saved on this phone'}
      </strong>
      <p style={{ margin: '0.4rem 0 0', color: '#475569', fontSize: '0.875rem' }}>
        You can continue working. Your inspection is saved on this phone and photos will upload when signal returns.
      </p>
      {offlineNotice ? (
        <p style={{ margin: '0.55rem 0 0', color: '#475569', fontSize: '0.875rem' }}>{offlineNotice}</p>
      ) : null}

      {showActiveCard ? (
        <ActiveInspectionStatusCard
          isOnline={isOnline}
          activeDraftPayload={activeDraftPayload}
          activeDraftRecord={activeDraftRecord}
          isSubmitting={isSubmitting}
        />
      ) : null}

      {savedDrafts.length > 0 ? (
        <div style={{ display: 'grid', gap: '0.65rem', marginTop: showActiveCard ? '0.65rem' : '0.75rem' }}>
          {savedDrafts.map((draft) => {
            const summary = getOfflineDraftStatusSummary(draft, isOnline)
            return (
              <InspectionStatusCard
                key={draft.id}
                title={summary.label}
                summary={summary}
                isSubmitting={isSubmitting}
                isOnline={isOnline}
                actions={
                  <>
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
                  </>
                }
              />
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

export { panelStyle as offlinePanelStyle, smallButtonStyle as offlineSmallButtonStyle }
