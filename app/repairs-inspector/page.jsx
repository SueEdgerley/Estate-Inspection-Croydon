'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import PhotoUploadControl from '@/app/components/questions/PhotoUploadControl'

const STATUS_OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'closed', label: 'Closed' },
]

function formatDate(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-GB')
}

function dateInputValue(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

function normalizeStatus(value) {
  const status = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  return STATUS_OPTIONS.some((option) => option.value === status) ? status : 'open'
}

function parsePhotoUrls(raw) {
  if (Array.isArray(raw)) return raw.filter((url) => typeof url === 'string' && url)
  if (typeof raw === 'string' && raw.trim()) {
    try {
      return parsePhotoUrls(JSON.parse(raw))
    } catch {
      return raw.startsWith('http') ? [raw] : []
    }
  }
  return []
}

function actionLabel(action) {
  const parts = [
    action.estate_block_name || action.inspection_title || 'Estate/block unknown',
    action.location || 'No location',
    action.description || action.comment || action.title || 'Repair action',
    action.inspection_date ? `Inspection ${formatDate(action.inspection_date)}` : '',
  ].filter(Boolean)
  return parts.join(' - ')
}

export default function RepairsInspectorFormPage() {
  const [actions, setActions] = useState([])
  const [requestedActionId, setRequestedActionId] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [message, setMessage] = useState('')
  const [form, setForm] = useState({
    estate_block: '',
    location: '',
    description: '',
    job_number: '',
    expected_completion_date: '',
    status: 'open',
    repair_notes: '',
    repair_photo_url: '',
  })

  const selectedAction = useMemo(
    () => actions.find((action) => action.id === selectedId) || null,
    [actions, selectedId]
  )

  async function loadActions() {
    setLoading(true)
    setLoadError('')
    try {
      const res = await fetch('/api/repairs-inspector/actions', {
        credentials: 'include',
        cache: 'no-store',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || data.details || 'Failed to load repair actions')
      setActions(Array.isArray(data) ? data : [])
    } catch (error) {
      setActions([])
      setLoadError(error?.message || 'Failed to load repair actions')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setRequestedActionId(new URLSearchParams(window.location.search).get('action') || '')
    loadActions()
  }, [])

  useEffect(() => {
    if (!requestedActionId || actions.length === 0) return
    if (actions.some((action) => action.id === requestedActionId)) {
      setSelectedId(requestedActionId)
    }
  }, [actions, requestedActionId])

  useEffect(() => {
    if (!selectedAction) return
    const existingRepairPhoto = selectedAction.repair_photo_url || ''
    setForm({
      estate_block: selectedAction.estate_block_name || selectedAction.inspection_title || '',
      location: selectedAction.location || '',
      description: selectedAction.description || selectedAction.comment || selectedAction.title || '',
      job_number: selectedAction.job_number || '',
      expected_completion_date: dateInputValue(selectedAction.expected_completion_date),
      status: normalizeStatus(selectedAction.status),
      repair_notes: selectedAction.repair_notes || '',
      repair_photo_url: existingRepairPhoto,
    })
    setMessage('')
  }, [selectedAction])

  const existingPhotos = selectedAction ? parsePhotoUrls(selectedAction.photo_urls) : []
  const repairPhotoValue = form.repair_photo_url ? [form.repair_photo_url] : []

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function submit(e) {
    e.preventDefault()
    if (!selectedAction) {
      setLoadError('Select an action first')
      return
    }
    if (!form.job_number.trim()) {
      setLoadError('Job number is required')
      return
    }

    setSaving(true)
    setLoadError('')
    setMessage('')
    try {
      const res = await fetch(`/api/actions/${encodeURIComponent(selectedAction.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          location: form.location.trim() || null,
          description: form.description.trim() || null,
          job_number: form.job_number.trim(),
          expected_completion_date: form.expected_completion_date || null,
          status: form.status,
          repair_notes: form.repair_notes.trim() || null,
          repair_photo_url: form.repair_photo_url || null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || data.details || 'Failed to update action')
      setMessage('Repair action updated.')
      await loadActions()
      setSelectedId(data.id || selectedAction.id)
    } catch (error) {
      setLoadError(error?.message || 'Failed to update action')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ maxWidth: 980 }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <Link href="/actions" style={{ color: '#1d4ed8', textDecoration: 'none', fontSize: '0.875rem' }}>
            Back to actions
          </Link>
          <Link href="/repairs-inspector/new" style={choiceStyle}>
            Log New Repair
          </Link>
          <Link href="/repairs-inspector" style={activeChoiceStyle}>
            Update Existing Repair
          </Link>
        </div>
        <h1 style={{ margin: '0.75rem 0 0', fontSize: '2rem', color: '#111827' }}>
          Repairs Inspector Updates
        </h1>
        <p style={{ margin: '0.5rem 0 0', color: '#64748b' }}>
          Update existing repair actions with job details for resident repairs posters.
        </p>
      </div>

      <form onSubmit={submit} style={{ display: 'grid', gap: '1rem' }}>
        <section style={cardStyle}>
          <label htmlFor="action-select" style={labelStyle}>Select action/issue</label>
          <select
            id="action-select"
            value={selectedId}
            onChange={(event) => setSelectedId(event.target.value)}
            style={inputStyle}
            disabled={loading}
            required
          >
            <option value="">{loading ? 'Loading repair actions...' : 'Select a repair action...'}</option>
            {actions.map((action) => (
              <option key={action.id} value={action.id}>
                {actionLabel(action)}
              </option>
            ))}
          </select>
          {actions.length === 0 && !loading && !loadError ? (
            <p style={{ margin: '0.75rem 0 0', color: '#64748b' }}>
              No open repair-related actions found.
            </p>
          ) : null}
        </section>

        {selectedAction ? (
          <>
            <section style={cardStyle}>
              <div style={gridStyle}>
                <div>
                  <label style={labelStyle}>Estate/block</label>
                  <input value={form.estate_block} readOnly style={{ ...inputStyle, background: '#f8fafc' }} />
                </div>
                <div>
                  <label htmlFor="location" style={labelStyle}>Location</label>
                  <input
                    id="location"
                    value={form.location}
                    onChange={(event) => setField('location', event.target.value)}
                    style={inputStyle}
                  />
                </div>
              </div>
              <label htmlFor="description" style={labelStyle}>Issue description</label>
              <textarea
                id="description"
                value={form.description}
                onChange={(event) => setField('description', event.target.value)}
                rows={4}
                style={textareaStyle}
              />
            </section>

            <section style={cardStyle}>
              <h2 style={sectionTitleStyle}>Photo</h2>
              {existingPhotos.length ? (
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                  {existingPhotos.slice(0, 3).map((url) => (
                    <a key={url} href={url} target="_blank" rel="noopener noreferrer">
                      <img src={url} alt="Existing issue" style={photoStyle} />
                    </a>
                  ))}
                </div>
              ) : (
                <p style={{ margin: '0 0 1rem', color: '#64748b' }}>No existing issue photo found.</p>
              )}
              <PhotoUploadControl
                id="repair-photo"
                value={repairPhotoValue}
                onChange={(urls) => setField('repair_photo_url', urls[0] || '')}
                label="Add repair photo"
                multiple={false}
              />
            </section>

            <section style={cardStyle}>
              <div style={gridStyle}>
                <div>
                  <label htmlFor="job-number" style={labelStyle}>
                    Job number <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <input
                    id="job-number"
                    value={form.job_number}
                    onChange={(event) => setField('job_number', event.target.value)}
                    style={inputStyle}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="expected-date" style={labelStyle}>Expected completion date</label>
                  <input
                    id="expected-date"
                    type="date"
                    value={form.expected_completion_date}
                    onChange={(event) => setField('expected_completion_date', event.target.value)}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label htmlFor="status" style={labelStyle}>Status</label>
                  <select
                    id="status"
                    value={form.status}
                    onChange={(event) => setField('status', event.target.value)}
                    style={inputStyle}
                  >
                    {STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <label htmlFor="repair-notes" style={labelStyle}>Repair notes/update</label>
              <textarea
                id="repair-notes"
                value={form.repair_notes}
                onChange={(event) => setField('repair_notes', event.target.value)}
                rows={5}
                style={textareaStyle}
              />
            </section>
          </>
        ) : null}

        {loadError ? <p style={{ color: '#b91c1c', margin: 0 }}>{loadError}</p> : null}
        {message ? <p style={{ color: '#166534', margin: 0 }}>{message}</p> : null}

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="submit"
            disabled={!selectedAction || saving}
            style={{
              padding: '0.75rem 1.25rem',
              borderRadius: '0.5rem',
              border: 'none',
              background: !selectedAction || saving ? '#9ca3af' : '#1d4ed8',
              color: '#fff',
              fontWeight: 700,
              cursor: !selectedAction || saving ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? 'Saving...' : 'Update repair action'}
          </button>
        </div>
      </form>
    </div>
  )
}

const cardStyle = {
  background: '#fff',
  border: '1px solid #e5e7eb',
  borderRadius: '0.75rem',
  padding: '1.25rem',
  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.08)',
}

const gridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: '1rem',
  marginBottom: '1rem',
}

const labelStyle = {
  display: 'block',
  marginBottom: '0.4rem',
  fontSize: '0.875rem',
  fontWeight: 600,
  color: '#374151',
}

const sectionTitleStyle = {
  margin: '0 0 1rem',
  fontSize: '1.125rem',
  color: '#111827',
}

const inputStyle = {
  width: '100%',
  padding: '0.75rem',
  border: '1px solid #d1d5db',
  borderRadius: '0.5rem',
  fontSize: '1rem',
  background: '#fff',
  boxSizing: 'border-box',
}

const textareaStyle = {
  ...inputStyle,
  fontFamily: 'inherit',
  resize: 'vertical',
}

const photoStyle = {
  width: 140,
  height: 100,
  objectFit: 'cover',
  borderRadius: '0.5rem',
  border: '1px solid #d1d5db',
}

const choiceStyle = {
  padding: '0.75rem 1.25rem',
  borderRadius: '0.5rem',
  border: '1px solid #cbd5e1',
  color: '#1d4ed8',
  textDecoration: 'none',
  fontWeight: 700,
  background: '#fff',
  display: 'inline-block',
}

const activeChoiceStyle = {
  ...choiceStyle,
  background: '#1d4ed8',
  color: '#fff',
  borderColor: '#1d4ed8',
}
