'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  draftHasOfficerProgress,
  formatSavedDraftIdentity,
  getInspectionDraftResumeHref,
  readOfflineInspectionDrafts,
  rememberActiveOfflineDraftId,
  selectResumableOfflineDrafts,
  summarizeOfflineDraft,
} from '@/lib/offline-inspection-drafts'

const panelStyle = {
  maxWidth: 800,
  margin: '0 0 1rem',
  padding: '0.9rem 1rem',
  border: '1px solid #93c5fd',
  borderRadius: '0.5rem',
  background: '#eff6ff',
  color: '#1e3a8a',
}

const smallButtonStyle = {
  padding: '0.55rem 0.8rem',
  minHeight: 44,
  border: '1px solid #93c5fd',
  borderRadius: '0.375rem',
  background: '#fff',
  color: '#1d4ed8',
  fontWeight: 700,
  cursor: 'pointer',
}

function formatInspectionDate(value) {
  if (!value) return ''
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    const date = new Date(`${value.slice(0, 10)}T12:00:00`)
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    }
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function SavedInspectionDraftsList({
  drafts = [],
  blocks = [],
  isOnline = true,
  isSubmitting = false,
  activeDraftId = '',
  onResumeDraft,
  onSubmitDraft,
  showSubmit = false,
}) {
  const visibleDrafts = selectResumableOfflineDrafts(drafts)
  if (!visibleDrafts.length) return null

  return (
    <div data-testid="saved-inspection-drafts" style={{ display: 'grid', gap: '0.65rem' }}>
      {visibleDrafts.map((draft) => {
        const summary = summarizeOfflineDraft(draft, { blocks })
        const identity = formatSavedDraftIdentity(summary)
        const inspectionDate = formatInspectionDate(summary.inspectionDate)
        const isActive = draft.id === activeDraftId
        return (
          <div
            key={draft.id}
            data-draft-id={draft.id}
            style={{
              display: 'flex',
              gap: '0.5rem',
              flexWrap: 'wrap',
              alignItems: 'center',
              padding: '0.65rem 0.7rem',
              background: '#fff',
              border: '1px solid #bfdbfe',
              borderRadius: '0.4rem',
            }}
          >
            <span style={{ flex: '1 1 220px', fontSize: '0.9rem', color: '#0f172a', lineHeight: 1.4 }}>
              <strong>{summary.label}</strong>
              {isActive ? ' · currently open' : ''}
              <span style={{ display: 'block', marginTop: 2, color: '#334155', fontWeight: 500 }}>
                {identity.location}
              </span>
              <span style={{ display: 'block', marginTop: 2, color: '#64748b', fontSize: '0.8125rem' }}>
                {inspectionDate ? `Inspection ${inspectionDate}` : 'Inspection date not recorded'}
                {summary.lastSavedAt ? ` · last saved ${summary.lastSavedAt}` : ''}
              </span>
              <span style={{ display: 'block', marginTop: 2, color: '#64748b', fontSize: '0.8125rem' }}>
                {identity.answersLabel}
                {' · '}
                {identity.photoLabel}
                {summary.pendingPhotoCount ? ` (${summary.pendingPhotoCount} still on this phone)` : ''}
              </span>
              <span
                style={{
                  display: 'block',
                  marginTop: 2,
                  color: '#475569',
                  fontSize: '0.75rem',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                  wordBreak: 'break-all',
                }}
              >
                {identity.idLabel}
              </span>
              {identity.emptyShellLabel ? (
                <span style={{ display: 'block', marginTop: 2, color: '#9a3412', fontSize: '0.75rem' }}>
                  {identity.emptyShellLabel}
                </span>
              ) : null}
            </span>
            <button
              type="button"
              onClick={() => onResumeDraft?.(draft)}
              style={smallButtonStyle}
            >
              Resume
            </button>
            {showSubmit ? (
              <button
                type="button"
                disabled={!isOnline || isSubmitting}
                onClick={() => onSubmitDraft?.(draft)}
                style={{
                  ...smallButtonStyle,
                  fontWeight: 600,
                  opacity: !isOnline || isSubmitting ? 0.55 : 1,
                  cursor: !isOnline || isSubmitting ? 'not-allowed' : 'pointer',
                }}
              >
                Submit inspection
              </button>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

export default function SavedInspectionDraftsPanel({
  drafts: draftsProp,
  blocks = [],
  isOnline = true,
  isSubmitting = false,
  activeDraftId = '',
  onResumeDraft,
  onSubmitDraft,
  showSubmit = false,
  style,
  title = 'Saved inspections on this phone',
  intro = 'These inspections are saved on this phone only until they are submitted. Resume restores that draft and does not delete the others.',
}) {
  const router = useRouter()
  const [localDrafts, setLocalDrafts] = useState([])
  const drafts = Array.isArray(draftsProp) ? draftsProp : localDrafts

  useEffect(() => {
    if (Array.isArray(draftsProp)) return undefined
    setLocalDrafts(readOfflineInspectionDrafts())
    const refresh = () => setLocalDrafts(readOfflineInspectionDrafts())
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [draftsProp])

  const handleResume = (draft) => {
    if (!draft?.id) return
    rememberActiveOfflineDraftId(draft.id)
    if (onResumeDraft) {
      onResumeDraft(draft)
      return
    }
    router.push(getInspectionDraftResumeHref(draft))
  }

  const hasVisible = drafts.some((draft) => draftHasOfficerProgress(draft?.payload || {}))
  if (!hasVisible) return null

  return (
    <section data-testid="saved-walkabouts-panel" style={{ ...panelStyle, ...style }} aria-label={title}>
      <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#1e3a8a' }}>{title}</h2>
      <p style={{ margin: '0.4rem 0 0.75rem', fontSize: '0.875rem', lineHeight: 1.45, color: '#1e40af' }}>
        {intro}
      </p>
      <SavedInspectionDraftsList
        drafts={drafts}
        blocks={blocks}
        isOnline={isOnline}
        isSubmitting={isSubmitting}
        activeDraftId={activeDraftId}
        onResumeDraft={handleResume}
        onSubmitDraft={onSubmitDraft}
        showSubmit={showSubmit}
      />
    </section>
  )
}
