'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useUser } from '@clerk/nextjs'
import {
  formatSavedDraftIdentity,
  selectResumableOfflineDrafts,
  summarizeOfflineDraft,
} from '@/lib/offline-inspection-drafts'
import { isWalkaboutOfflineDraft } from '@/lib/walkabout-draft-restore'
import { readPhoneDraftsBackup } from '@/lib/offline-draft-export'
import {
  lookupWalkaboutDraftStatuses,
  walkaboutDraftResumeAllowed,
  walkaboutDraftStatusLabel,
  WALKABOUT_DRAFT_SUBMISSION,
} from '@/lib/walkabout-draft-submission-status'

function FolderOpenIcon({ size = 18 }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2" />
    </svg>
  )
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

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const recoverButtonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  minHeight: 44,
  padding: '0.45rem 0.75rem',
  border: '1px solid #cbd5e1',
  borderRadius: 8,
  background: '#fff',
  color: '#475569',
  fontWeight: 600,
  fontSize: 14,
  lineHeight: 1.2,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  boxShadow: 'none',
}

const secondaryButtonStyle = {
  ...recoverButtonStyle,
  fontWeight: 600,
}

export function WalkaboutRecoverDraftsButton({ open = false, onClick }) {
  return (
    <button
      type="button"
      data-testid="walkabout-recover-drafts-button"
      aria-expanded={open ? 'true' : 'false'}
      aria-controls="walkabout-recover-drafts-view"
      onClick={onClick}
      style={recoverButtonStyle}
    >
      <FolderOpenIcon />
      Recover drafts
    </button>
  )
}

export default function WalkaboutRecoverDraftsView({
  drafts = [],
  blocks = [],
  activeDraftId = '',
  onResumeDraft,
  onBack,
}) {
  const { user } = useUser()
  const visibleDrafts = useMemo(
    () => selectResumableOfflineDrafts(drafts).filter((draft) => isWalkaboutOfflineDraft(draft)),
    [drafts]
  )
  const draftStatusKey = visibleDrafts.map((draft) => draft.id).join('|')
  const [statuses, setStatuses] = useState({})
  const [statusReady, setStatusReady] = useState(false)
  const [downloadHint, setDownloadHint] = useState('')

  useEffect(() => {
    let cancelled = false
    setStatusReady(false)
    lookupWalkaboutDraftStatuses(visibleDrafts)
      .then((next) => {
        if (!cancelled) setStatuses(next || {})
      })
      .catch(() => {
        if (!cancelled) setStatuses({})
      })
      .finally(() => {
        if (!cancelled) setStatusReady(true)
      })
    return () => {
      cancelled = true
    }
    // draftStatusKey captures identity; visibleDrafts is read from the latest render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftStatusKey])

  const handleDownload = () => {
    const email =
      user?.primaryEmailAddress?.emailAddress || user?.emailAddresses?.[0]?.emailAddress || null
    const payload = {
      ...readPhoneDraftsBackup(),
      exportedByEmail: email,
    }
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
    downloadJson(`walkabout-drafts-backup-${stamp}.json`, payload)
    setDownloadHint('The file has been saved on this phone. It has not been sent anywhere.')
  }

  return (
    <section
      id="walkabout-recover-drafts-view"
      data-testid="walkabout-recover-drafts-view"
      aria-label="Recover saved Walkabout drafts"
      style={{
        margin: '0 0 1.5rem',
        padding: '1rem 1rem 1.15rem',
        border: '1px solid #e2e8f0',
        borderRadius: 12,
        background: '#fff',
        color: '#0f172a',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>
          Recover saved Walkabouts
        </h2>
        <button type="button" onClick={onBack} style={secondaryButtonStyle}>
          Back to Walkabout
        </button>
      </div>
      <p style={{ margin: '0.65rem 0 0', fontSize: '0.875rem', lineHeight: 1.5, color: '#475569' }}>
        These inspections are saved on this phone only. Opening this list does not resume or change
        anything. Resume a genuine unfinished inspection only when you need to. Do not resume an
        inspection that has already been submitted.
      </p>

      {visibleDrafts.length === 0 ? (
        <p style={{ margin: '1rem 0 0', color: '#64748b', fontSize: '0.9rem' }}>
          No saved Walkabout drafts were found on this phone.
        </p>
      ) : (
        <div style={{ display: 'grid', gap: '0.65rem', marginTop: '0.9rem' }}>
          {visibleDrafts.map((draft) => {
            const summary = summarizeOfflineDraft(draft, { blocks })
            const identity = formatSavedDraftIdentity(summary)
            const inspectionDate = formatInspectionDate(summary.inspectionDate)
            const isActive = draft.id === activeDraftId
            const classified = statuses[draft.id] || {
              status: statusReady ? WALKABOUT_DRAFT_SUBMISSION.UNKNOWN : WALKABOUT_DRAFT_SUBMISSION.UNKNOWN,
            }
            const status = classified.status || WALKABOUT_DRAFT_SUBMISSION.UNKNOWN
            const statusLabel = statusReady ? walkaboutDraftStatusLabel(status) : 'Checking submission status…'
            const canResume = statusReady && walkaboutDraftResumeAllowed(status)
            const submitted = status === WALKABOUT_DRAFT_SUBMISSION.SUBMITTED
            return (
              <div
                key={draft.id}
                data-draft-id={draft.id}
                data-submission-status={statusReady ? status : 'checking'}
                style={{
                  display: 'flex',
                  gap: '0.5rem',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  padding: '0.7rem 0.75rem',
                  background: submitted ? '#f8fafc' : '#fff',
                  border: `1px solid ${submitted ? '#cbd5e1' : '#e2e8f0'}`,
                  borderRadius: 8,
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
                  {statusLabel ? (
                    <span
                      style={{
                        display: 'block',
                        marginTop: 4,
                        color: submitted ? '#9a3412' : '#475569',
                        fontSize: '0.8125rem',
                        fontWeight: 700,
                      }}
                    >
                      {statusLabel}
                    </span>
                  ) : null}
                </span>
                <button
                  type="button"
                  disabled={!canResume}
                  onClick={() => {
                    if (!canResume) return
                    onResumeDraft?.(draft)
                  }}
                  style={{
                    ...recoverButtonStyle,
                    color: canResume ? '#1e3a8a' : '#94a3b8',
                    borderColor: canResume ? '#cbd5e1' : '#e2e8f0',
                    cursor: canResume ? 'pointer' : 'not-allowed',
                    opacity: canResume ? 1 : 0.7,
                  }}
                >
                  Resume
                </button>
              </div>
            )
          })}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          alignItems: 'center',
          marginTop: '1rem',
        }}
      >
        <button type="button" onClick={handleDownload} style={secondaryButtonStyle}>
          Download backup file
        </button>
        <Link href="/phone-drafts" style={{ color: '#334155', fontSize: 14, fontWeight: 600 }}>
          Open drafts backup page
        </Link>
      </div>
      {downloadHint ? (
        <p style={{ margin: '0.6rem 0 0', color: '#334155', fontSize: '0.8125rem' }}>{downloadHint}</p>
      ) : (
        <p style={{ margin: '0.6rem 0 0', color: '#64748b', fontSize: '0.8125rem' }}>
          Download is read-only. It does not submit, resume or delete drafts.
        </p>
      )}
    </section>
  )
}
