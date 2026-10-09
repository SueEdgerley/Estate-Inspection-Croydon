'use client'

/**
 * Temporary recovery page. Read-only: localStorage.getItem only.
 * Remove this route after Andy Foster's Hillside House drafts have been recovered.
 */

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { SignedIn, SignedOut, SignInButton, useUser } from '@clerk/nextjs'
import { readPhoneDraftsBackup, summarizeOfflineDraft } from '@/lib/offline-draft-export'

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

function formatStarted(startedAt) {
  if (!startedAt) return '—'
  const date = new Date(startedAt)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
}

function officerEmailFromUser(user) {
  return user?.primaryEmailAddress?.emailAddress || user?.emailAddresses?.[0]?.emailAddress || ''
}

export default function PhoneDraftsBackupPage() {
  const { user } = useUser()
  const [snapshot, setSnapshot] = useState(null)
  const [downloadHint, setDownloadHint] = useState('')

  const load = () => {
    setDownloadHint('')
    setSnapshot(readPhoneDraftsBackup())
  }

  const rows = useMemo(
    () => (Array.isArray(snapshot?.drafts) ? snapshot.drafts.map(summarizeOfflineDraft) : []),
    [snapshot]
  )
  const hillsideRows = rows.filter((row) => row.possibleHillside)

  const handleDownload = () => {
    const payload = {
      ...(snapshot || readPhoneDraftsBackup()),
      exportedByEmail: officerEmailFromUser(user) || null,
    }
    if (!snapshot) setSnapshot(payload)
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
    downloadJson(`walkabout-drafts-backup-${stamp}.json`, payload)
    setDownloadHint('The file has been saved on this phone. It has not been sent anywhere. Email it from your Croydon work email.')
  }

  return (
    <div style={{ maxWidth: 880, margin: '0 auto', padding: '1.25rem 1rem 3rem' }}>
      <Link href="/" style={{ color: '#1d4ed8', fontWeight: 600, textDecoration: 'none' }}>
        ← Home
      </Link>
      <h1 style={{ margin: '1rem 0 0.5rem', fontSize: '1.5rem', color: '#0f172a' }}>
        Drafts saved on this phone
      </h1>
      <p style={{ margin: 0, color: '#334155', lineHeight: 1.55, fontSize: '0.95rem' }}>
        This page only <strong>reads</strong> drafts already stored in this browser. It does not change,
        delete, submit or resume any inspection, and it does not upload or email the file. Do not open
        Forms or Estate Walkabout until the backup file has been emailed.
      </p>

      <SignedOut>
        <p style={{ marginTop: '1.25rem' }}>
          <SignInButton>
            <button type="button" style={primaryButton}>
              Sign in to view drafts on this phone
            </button>
          </SignInButton>
        </p>
      </SignedOut>

      <SignedIn>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', marginTop: '1.25rem' }}>
          <button type="button" onClick={load} style={primaryButton}>
            Show drafts on this phone
          </button>
          <button type="button" onClick={handleDownload} style={secondaryButton}>
            Download backup file
          </button>
        </div>

        {snapshot ? (
          <div style={{ marginTop: '1.25rem' }}>
            <p style={{ margin: '0 0 0.75rem', color: '#0f172a', fontWeight: 600 }}>
              {rows.length} saved draft{rows.length === 1 ? '' : 's'} on this phone
              {hillsideRows.length ? ` · ${hillsideRows.length} mention Hillside` : ''}
            </p>
            {rows.length === 0 ? (
              <p style={{ color: '#64748b' }}>No drafts were found in this browser profile.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                  <thead>
                    <tr>
                      {['Draft ID', 'Saved', 'Started', 'Location', 'Answers', 'Photos', 'Note'].map((heading) => (
                        <th
                          key={heading}
                          style={{
                            textAlign: 'left',
                            padding: '0.5rem 0.6rem',
                            borderBottom: '1px solid #cbd5e1',
                            color: '#334155',
                          }}
                        >
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr
                        key={row.id}
                        style={{ background: row.possibleHillside ? '#ecfdf5' : '#fff' }}
                      >
                        <td style={{ ...tdStyle, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', fontSize: '0.75rem', wordBreak: 'break-all' }}>
                          {row.id || '—'}
                        </td>
                        <td style={tdStyle}>{row.lastSavedAt || '—'}</td>
                        <td style={tdStyle}>{formatStarted(row.startedAt)}</td>
                        <td style={tdStyle}>{row.location || row.blockId || 'Not recorded'}</td>
                        <td style={tdStyle}>{row.filledAnswerCount}</td>
                        <td style={tdStyle}>
                          {row.photoCount}
                          {row.pendingPhotoCount ? ` (${row.pendingPhotoCount} on phone)` : ''}
                        </td>
                        <td style={tdStyle}>{row.possibleHillside ? 'Possible Hillside' : 'Saved on this phone'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p
              style={{
                margin: '1rem 0 0',
                color: downloadHint ? '#065f46' : '#64748b',
                fontSize: '0.85rem',
                lineHeight: 1.45,
              }}
            >
              {downloadHint ||
                'Tap Download backup file, then email that file from your Croydon work email. Leave this page afterwards.'}
            </p>
          </div>
        ) : (
          <p style={{ marginTop: '1rem', color: '#64748b', fontSize: '0.9rem' }}>
            Tap Show drafts, then Download backup file.
          </p>
        )}
      </SignedIn>
    </div>
  )
}

const primaryButton = {
  padding: '0.75rem 1rem',
  minHeight: 48,
  background: '#1d4ed8',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  fontWeight: 700,
  cursor: 'pointer',
}

const secondaryButton = {
  ...primaryButton,
  background: '#fff',
  color: '#1d4ed8',
  border: '2px solid #1d4ed8',
}

const tdStyle = {
  padding: '0.55rem 0.6rem',
  borderBottom: '1px solid #e2e8f0',
  verticalAlign: 'top',
  color: '#0f172a',
}
