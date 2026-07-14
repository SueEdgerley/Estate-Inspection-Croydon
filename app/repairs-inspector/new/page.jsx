'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import PhotoUploadControl from '@/app/components/questions/PhotoUploadControl'

const initialForm = {
  location_id: '',
  estate_id: '',
  block_id: '',
  estate_block: '',
  area: '',
  location: '',
  description: '',
  photo_urls: [],
}

function toDatetimeLocalValue(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function datetimeLocalToIso(value) {
  if (!value) return undefined
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
}

function getInspectionDurationLabel(startValue, endValue) {
  const start = startValue ? new Date(startValue) : null
  const end = endValue ? new Date(endValue) : new Date()
  if (!start || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return ''
  const totalMinutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
}

export default function RepairsInspectorNewFormPage() {
  const [form, setForm] = useState(initialForm)
  const [inspectionStartTime, setInspectionStartTime] = useState(() => toDatetimeLocalValue())
  const [inspectionEndTime, setInspectionEndTime] = useState('')
  const [locations, setLocations] = useState([])
  const [loadingLocations, setLoadingLocations] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    let cancelled = false
    async function loadReferenceData() {
      setLoadingLocations(true)
      try {
        const response = await fetch('/api/repairs-inspector/reference', {
          credentials: 'include',
          cache: 'no-store',
        })
        const data = await response.json().catch(() => ({}))
        if (!cancelled) setLocations(Array.isArray(data.locations) ? data.locations : [])
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Failed to load estate/block list')
      } finally {
        if (!cancelled) setLoadingLocations(false)
      }
    }
    loadReferenceData()
    return () => {
      cancelled = true
    }
  }, [])

  const selectedLocation = useMemo(
    () => locations.find((location) => location.id === form.location_id) || null,
    [locations, form.location_id]
  )

  const locationOptions = useMemo(() => {
    if (!selectedLocation) return []
    const sameEstate = selectedLocation.estate_id
      ? locations.filter((location) => location.estate_id === selectedLocation.estate_id)
      : [selectedLocation]
    const seen = new Set()
    return sameEstate
      .filter((location) => {
        const label = location.label || location.block_name || location.estate_name
        if (!label || seen.has(label)) return false
        seen.add(label)
        return true
      })
      .sort((a, b) =>
        String(a.label || a.block_name || '').localeCompare(
          String(b.label || b.block_name || ''),
          'en-GB',
          { sensitivity: 'base', numeric: true }
        )
      )
  }, [locations, selectedLocation])
  const inspectionDurationLabel = getInspectionDurationLabel(inspectionStartTime, inspectionEndTime)

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const chooseEstateBlock = (locationId) => {
    const chosen = locations.find((location) => location.id === locationId)
    if (!chosen) {
      setForm((prev) => ({
        ...prev,
        location_id: '',
        estate_id: '',
        block_id: '',
        estate_block: '',
        area: '',
        location: '',
      }))
      return
    }
    setForm((prev) => ({
      ...prev,
      location_id: chosen.id,
      estate_id: chosen.estate_id || '',
      block_id: chosen.block_id || '',
      estate_block: chosen.label || '',
      area: chosen.area || '',
      location: chosen.label || '',
    }))
  }

  async function submit(event) {
    event.preventDefault()
    setError('')
    setMessage('')

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
      if (!inspectionEndTime) setInspectionEndTime(toDatetimeLocalValue())
      const response = await fetch('/api/repairs-inspector/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          estate_block: form.estate_block.trim(),
          estate_id: form.estate_id || null,
          block_id: form.block_id || null,
          area: form.area || null,
          location: form.location.trim(),
          description: form.description.trim(),
          photo_urls: form.photo_urls,
          inspection_start_time: datetimeLocalToIso(inspectionStartTime),
          inspection_end_time: datetimeLocalToIso(inspectionEndTime),
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.details || data.error || `Request failed (${response.status})`)

      setMessage('Repair action created successfully.')
      setForm(initialForm)
      setInspectionStartTime(toDatetimeLocalValue())
      setInspectionEndTime('')
    } catch (err) {
      setError(err?.message || 'Failed to create repair action')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <Link href="/repairs-inspector/new" style={activeChoiceStyle}>
            Log New Repair
          </Link>
        </div>
        <h1 style={{ margin: '0.75rem 0 0', fontSize: '2rem', color: '#111827' }}>
          Log New Repair
        </h1>
        <p style={{ margin: '0.5rem 0 0', color: '#64748b' }}>
          Log a new repair directly while on site. This creates one Repairs action for tracking and posters.
        </p>
      </div>

      <form onSubmit={submit} style={{ display: 'grid', gap: '1rem' }}>
        <section style={cardStyle}>
          <h2 style={sectionTitleStyle}>Inspection time</h2>
          <div style={gridStyle}>
            <div>
              <label htmlFor="inspection-start-time" style={labelStyle}>Inspection start time</label>
              <input
                id="inspection-start-time"
                type="datetime-local"
                value={inspectionStartTime}
                onChange={(event) => setInspectionStartTime(event.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label htmlFor="inspection-end-time" style={labelStyle}>Inspection end time</label>
              <input
                id="inspection-end-time"
                type="datetime-local"
                value={inspectionEndTime}
                onChange={(event) => setInspectionEndTime(event.target.value)}
                style={inputStyle}
              />
              <p style={{ margin: '0.35rem 0 0', fontSize: '0.8125rem', color: '#64748b' }}>
                Leave blank to use the submit time.
              </p>
            </div>
          </div>
          {inspectionDurationLabel ? (
            <p style={{ margin: '0.75rem 0 0', fontSize: '0.875rem', color: '#374151' }}>Duration: {inspectionDurationLabel}</p>
          ) : null}
        </section>

        <section style={cardStyle}>
          <h2 style={sectionTitleStyle}>Repair details</h2>
          <div style={gridStyle}>
            <div>
              <label htmlFor="estate-block" style={labelStyle}>
                Estate/block <span style={requiredStyle}>*</span>
              </label>
              <select
                id="estate-block"
                value={form.location_id}
                onChange={(event) => chooseEstateBlock(event.target.value)}
                style={inputStyle}
                required
                disabled={loadingLocations}
              >
                <option value="">{loadingLocations ? 'Loading estate/block list...' : 'Select estate/block...'}</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="area" style={labelStyle}>Area</label>
              <input
                id="area"
                value={form.area || 'Not recorded'}
                readOnly
                style={{ ...inputStyle, background: '#f8fafc' }}
              />
            </div>
            <div>
              <label htmlFor="location" style={labelStyle}>
                Location <span style={requiredStyle}>*</span>
              </label>
              <select
                id="location"
                value={form.location}
                onChange={(event) => setField('location', event.target.value)}
                style={inputStyle}
                required
                disabled={!selectedLocation}
              >
                <option value="">{selectedLocation ? 'Select closest location...' : 'Select estate/block first'}</option>
                {locationOptions.map((location) => (
                  <option key={location.id} value={location.label}>
                    {location.label}
                  </option>
                ))}
              </select>
              <p style={{ margin: '0.4rem 0 0', color: '#64748b', fontSize: '0.8125rem' }}>
                If the exact location is not listed, select the closest option and add details in notes/comments.
              </p>
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

        {error ? <p style={{ color: '#b91c1c', margin: 0 }}>{error}</p> : null}
        {message ? (
          <div style={{ ...cardStyle, borderColor: '#bbf7d0', background: '#f0fdf4' }}>
            <p style={{ color: '#166534', margin: '0 0 0.75rem', fontWeight: 700 }}>
              {message}
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <Link href="/actions" style={secondaryButtonStyle}>
                View in Issues/Actions
              </Link>
              <button
                type="button"
                onClick={() => {
                  setMessage('')
                  setError('')
                }}
                style={primaryButtonStyle}
              >
                Log another repair
              </button>
            </div>
          </div>
        ) : null}

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
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

const choiceStyle = {
  ...secondaryButtonStyle,
  display: 'inline-block',
}

const activeChoiceStyle = {
  ...choiceStyle,
  background: '#1d4ed8',
  color: '#fff',
  borderColor: '#1d4ed8',
}
