'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { formatInspectionFollowUpTimestamp } from '@/lib/inspection-follow-up-updates'

const panelStyle = {
  backgroundColor: 'white',
  padding: '1.25rem',
  borderRadius: '0.5rem',
  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  border: '1px solid #e5e7eb',
}

/**
 * Append-only follow-up notes on a submitted inspection (evidence stays locked).
 */
export default function InspectionFollowUpUpdates({
  inspectionId,
  canAdd = false,
  isSubmitted = false,
  autoFocusForm = false,
}) {
  const [updates, setUpdates] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [showForm, setShowForm] = useState(autoFocusForm)
  const textareaRef = useRef(null)

  const loadUpdates = useCallback(async () => {
    if (!inspectionId) return
    setLoading(true)
    setLoadError('')
    try {
      const res = await fetch(`/api/inspections/${encodeURIComponent(inspectionId)}/updates`, {
        credentials: 'include',
        cache: 'no-store',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setLoadError(data?.error || `Could not load updates (${res.status})`)
        setUpdates([])
        return
      }
      setUpdates(Array.isArray(data.updates) ? data.updates : [])
    } catch (error) {
      setLoadError(error?.message || 'Could not load updates')
      setUpdates([])
    } finally {
      setLoading(false)
    }
  }, [inspectionId])

  useEffect(() => {
    loadUpdates()
  }, [loadUpdates])

  useEffect(() => {
    if (autoFocusForm) setShowForm(true)
  }, [autoFocusForm])

  useEffect(() => {
    if (showForm && canAdd) {
      textareaRef.current?.focus()
    }
  }, [showForm, canAdd])

  const submitUpdate = async () => {
    const text = draft.trim()
    if (!text || saving) return
    setSaving(true)
    setSaveError('')
    try {
      const res = await fetch(`/api/inspections/${encodeURIComponent(inspectionId)}/updates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ body: text }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setSaveError(data?.error || data?.details || `Could not save update (${res.status})`)
        return
      }
      if (data.update) {
        setUpdates((prev) => [...prev, data.update])
      } else {
        await loadUpdates()
      }
      setDraft('')
      setShowForm(false)
    } catch (error) {
      setSaveError(error?.message || 'Could not save update')
    } finally {
      setSaving(false)
    }
  }

  if (!isSubmitted) return null

  return (
    <div id="follow-up-updates" style={{ ...panelStyle, marginBottom: '1.5rem' }}>
      <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.25rem', fontWeight: 600 }}>
        Updates / Follow-up notes
      </h2>
      <p style={{ margin: '0 0 1rem', fontSize: '0.875rem', color: '#6b7280', lineHeight: 1.5 }}>
        The original inspection record is locked. Add repair updates, contractor notes, or completion comments here —
        they are appended with a timestamp and cannot change earlier answers or photos.
      </p>

      {loading ? (
        <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>Loading updates…</p>
      ) : loadError ? (
        <p style={{ color: '#b45309', fontSize: '0.875rem' }}>{loadError}</p>
      ) : updates.length === 0 ? (
        <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: canAdd ? '1rem' : 0 }}>
          No follow-up notes yet.
        </p>
      ) : (
        <ul
          style={{
            listStyle: 'none',
            margin: '0 0 1rem',
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: '0.85rem',
          }}
        >
          {updates.map((item) => (
            <li
              key={item.id}
              style={{
                padding: '0.85rem 1rem',
                backgroundColor: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '0.5rem',
              }}
            >
              <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#475569', marginBottom: '0.35rem' }}>
                {formatInspectionFollowUpTimestamp(item.created_at)} — {item.author_name || item.author_email}
              </div>
              <p style={{ margin: 0, fontSize: '0.9375rem', color: '#111827', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                {item.body}
              </p>
            </li>
          ))}
        </ul>
      )}

      {canAdd ? (
        <div>
          {!showForm ? (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              style={{
                width: '100%',
                minHeight: 48,
                padding: '0.85rem 1.25rem',
                borderRadius: '0.5rem',
                border: 'none',
                backgroundColor: '#0f766e',
                color: '#fff',
                fontWeight: 700,
                fontSize: '1rem',
                cursor: 'pointer',
              }}
            >
              Add update
            </button>
          ) : (
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              <label htmlFor="follow_up_update_body" style={{ fontSize: '0.875rem', fontWeight: 600, color: '#374151' }}>
                New follow-up note
              </label>
              <textarea
                ref={textareaRef}
                id="follow_up_update_body"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={4}
                placeholder="e.g. Repair raised with contractor / Work completed and area checked"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: '1rem',
                  lineHeight: 1.5,
                  boxSizing: 'border-box',
                  resize: 'vertical',
                }}
              />
              {saveError ? (
                <p style={{ margin: 0, color: '#b91c1c', fontSize: '0.875rem' }}>{saveError}</p>
              ) : null}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={submitUpdate}
                  disabled={saving || !draft.trim()}
                  style={{
                    flex: '1 1 140px',
                    minHeight: 44,
                    padding: '0.75rem 1rem',
                    borderRadius: '0.375rem',
                    border: 'none',
                    backgroundColor: saving ? '#94a3b8' : '#0f766e',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: '0.9375rem',
                    cursor: saving ? 'not-allowed' : 'pointer',
                  }}
                >
                  {saving ? 'Saving…' : 'Save update'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false)
                    setSaveError('')
                  }}
                  disabled={saving}
                  style={{
                    flex: '1 1 100px',
                    minHeight: 44,
                    padding: '0.75rem 1rem',
                    borderRadius: '0.375rem',
                    border: '1px solid #d1d5db',
                    backgroundColor: '#fff',
                    color: '#374151',
                    fontWeight: 600,
                    fontSize: '0.9375rem',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
