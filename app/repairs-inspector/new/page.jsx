'use client'

import { useState } from 'react'
import Link from 'next/link'
import PhotoUploadControl from '@/app/components/questions/PhotoUploadControl'

const STATUS_OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'closed', label: 'Closed' },
]

const initialForm = {
  estate_block: '',
  location: '',
  description: '',
  photo_urls: [],
  job_number: '',
  expected_completion_date: '',
  status: 'open',
  repair_notes: '',
}

export default function RepairsInspectorNewFormPage() {
  const [form, setForm] = useState(initialForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [created, setCreated] = useState(null)

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function submit(event) {
    event.preventDefault()
    setError('')
    setMessage('')
    setCreated(null)

    if (!form.estate_block.trim()) {
      setError('Estate/block is required')
      return
    }
    if (!form.location.trim()) {
      setError('Location is required')
      return
    }
    if (!form.description.trim()) {
      setError('Repair issue/description is required')
      return
    }

    setSaving(true)
    try {
      const response = await fetch('/api/repairs-inspector/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          estate_block: form.estate_block.trim(),
          location: form.location.trim(),
          description: form.description.trim(),
          photo_urls: form.photo_urls,
          job_number: form.job_number.trim() || null,
          expected_completion_date: form.expected_completion_date || null,
          status: form.status || 'open',
          repair_notes: form.repair_notes.trim() || null,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || data.details || 'Failed to create repair action')

      setCreated(data)
      setMessage('Repair action created.')
      setForm(initialForm)
    } catch (err) {
      setError(err?.message || 'Failed to create repair action')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <Link href="/repairs-inspector" style={{ color: '#1d4ed8', textDecoration: 'none', fontSize: '0.875rem' }}>
          Back to repairs update screen
        </Link>
        <h1 style={{ margin: '0.75rem 0 0', fontSize: '2rem', color: '#111827' }}>
          Repairs Inspector Form
        </h1>
        <p style={{ margin: '0.5rem 0 0', color: '#64748b' }}>
          Log a new repair directly while on site. This creates one Repairs action for tracking and posters.
        </p>
      </div>

      <form onSubmit={submit} style={{ display: 'grid', gap: '1rem' }}>
        <section style={cardStyle}>
          <h2 style={sectionTitleStyle}>Repair details</h2>
          <div style={gridStyle}>
            <div>
              <label htmlFor="estate-block" style={labelStyle}>
                Estate/block <span style={requiredStyle}>*</span>
              </label>
              <input
                id="estate-block"
                value={form.estate_block}
                onChange={(event) => setField('estate_block', event.target.value)}
                style={inputStyle}
                required
              />
            </div>
            <div>
              <label htmlFor="location" style={labelStyle}>
                Location <span style={requiredStyle}>*</span>
              </label>
              <input
                id="location"
                value={form.location}
                onChange={(event) => setField('location', event.target.value)}
                style={inputStyle}
                required
              />
            </div>
          </div>
          <label htmlFor="description" style={labelStyle}>
            Repair issue/description <span style={requiredStyle}>*</span>
          </label>
          <textarea
            id="description"
            value={form.description}
            onChange={(event) => setField('description', event.target.value)}
            rows={5}
            style={textareaStyle}
            required
          />
        </section>

        <section style={cardStyle}>
          <h2 style={sectionTitleStyle}>Photo</h2>
          <PhotoUploadControl
            id="direct-repair-photo"
            value={form.photo_urls}
            onChange={(urls) => setField('photo_urls', urls)}
            label="Add repair photo"
            multiple
          />
        </section>

        <section style={cardStyle}>
          <h2 style={sectionTitleStyle}>Tracking update</h2>
          <div style={gridStyle}>
            <div>
              <label htmlFor="job-number" style={labelStyle}>Job number</label>
              <input
                id="job-number"
                value={form.job_number}
                onChange={(event) => setField('job_number', event.target.value)}
                style={inputStyle}
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

        {error ? <p style={{ color: '#b91c1c', margin: 0 }}>{error}</p> : null}
        {message ? (
          <p style={{ color: '#166534', margin: 0 }}>
            {message} {created?.action_id ? `Action ID: ${created.action_id}` : ''}
          </p>
        ) : null}

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <Link href="/repairs-inspector" style={secondaryButtonStyle}>
            Update existing actions
          </Link>
          <button
            type="submit"
            disabled={saving}
            style={{
              ...primaryButtonStyle,
              background: saving ? '#9ca3af' : '#1d4ed8',
              cursor: saving ? 'wait' : 'pointer',
            }}
          >
            {saving ? 'Creating...' : 'Create repair action'}
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

const requiredStyle = {
  color: '#dc2626',
}

const primaryButtonStyle = {
  padding: '0.75rem 1.25rem',
  borderRadius: '0.5rem',
  border: 'none',
  color: '#fff',
  fontWeight: 700,
}

const secondaryButtonStyle = {
  padding: '0.75rem 1.25rem',
  borderRadius: '0.5rem',
  border: '1px solid #cbd5e1',
  color: '#1d4ed8',
  textDecoration: 'none',
  fontWeight: 700,
  background: '#fff',
}
