'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function AdHocInspectionForm({ defaultTemplateId }) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [inspectionDate, setInspectionDate] = useState('')
  const [location, setLocation] = useState('')
  const [notes, setNotes] = useState('')
  const [submitError, setSubmitError] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitError(null)
    const name = title.trim()
    if (!name) {
      setSubmitError('Please enter an inspection name.')
      return
    }
    if (!defaultTemplateId) {
      setSubmitError(
        'No default template is available. Add templates in Airtable or set SIMPLE_INSPECTION_TEMPLATE_ID.'
      )
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/inspections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          template_id: defaultTemplateId,
          title: name,
          due_date: inspectionDate || undefined,
          location: location.trim() || undefined,
          description: notes.trim() || undefined,
          answers: {},
          answer_extras: {},
          source: 'ad_hoc',
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg =
          res.status === 401
            ? 'Please sign in at the top of the page, then try again.'
            : data.error || data.details || `Request failed (${res.status})`
        setSubmitError(msg)
        return
      }
      const inspectionId = data.inspectionId ?? data.id
      if (inspectionId) router.push(`/inspections/${inspectionId}`)
      else setSubmitError('Save reported success but no inspection ID was returned.')
    } catch (err) {
      setSubmitError(err.message || 'Something went wrong')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <Link
          href="/inspections"
          style={{
            color: '#3b82f6',
            textDecoration: 'none',
            fontSize: '0.875rem',
            display: 'inline-block',
            marginBottom: '1rem',
          }}
        >
          ← Back to Manage Inspections
        </Link>
        <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 'bold', color: '#111827' }}>
          Create ad hoc inspection
        </h1>
        <p style={{ margin: '0.5rem 0 0 0', color: '#6b7280', maxWidth: '36rem', lineHeight: 1.5 }}>
          Quick capture: name, date, location, and notes. Saves to the same inspections list as Manage
          Inspections (marked as ad hoc).
        </p>
      </div>

      {!defaultTemplateId ? (
        <div
          style={{
            padding: '1rem 1.25rem',
            backgroundColor: '#fffbeb',
            border: '1px solid #fcd34d',
            borderRadius: '0.5rem',
            color: '#92400e',
            maxWidth: '560px',
          }}
        >
          No templates are available in Airtable. Add at least one template, or set{' '}
          <code style={{ fontSize: '0.875em' }}>SIMPLE_INSPECTION_TEMPLATE_ID</code>.
        </div>
      ) : !showForm ? (
        <div
          style={{
            maxWidth: '560px',
            backgroundColor: '#fff',
            borderRadius: '0.5rem',
            border: '1px solid #e5e7eb',
            boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              backgroundColor: '#374151',
              color: '#fff',
              padding: '0.85rem 1.25rem',
              fontSize: '1.0625rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span>Create inspection</span>
          </div>
          <div style={{ padding: '1.75rem 1.25rem' }}>
            <p style={{ margin: '0 0 1.25rem', color: '#4b5563', fontSize: '0.9375rem', lineHeight: 1.55 }}>
              Start a minimal ad hoc inspection record. You will enter inspection name, date, location, and
              optional notes—no template picker.
            </p>
            <button
              type="button"
              onClick={() => setShowForm(true)}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: '#0f766e',
                color: '#fff',
                border: 'none',
                borderRadius: '0.5rem',
                fontSize: '1rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Create inspection
            </button>
          </div>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          style={{
            backgroundColor: 'white',
            padding: 0,
            borderRadius: '0.5rem',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            maxWidth: '560px',
            border: '1px solid #e5e7eb',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              backgroundColor: '#374151',
              color: '#fff',
              padding: '0.85rem 1.25rem',
              fontSize: '1.0625rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span>Create inspection</span>
            <button
              type="button"
              onClick={() => {
                setShowForm(false)
                setSubmitError(null)
              }}
              aria-label="Close form"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#fff',
                fontSize: '1.25rem',
                lineHeight: 1,
                cursor: 'pointer',
                padding: '0 0.25rem',
              }}
            >
              ×
            </button>
          </div>

          <div style={{ padding: '1.5rem 1.25rem 1.75rem' }}>
            {submitError && (
              <div
                style={{
                  padding: '0.75rem',
                  marginBottom: '1.25rem',
                  backgroundColor: '#fee2e2',
                  color: '#dc2626',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem',
                }}
              >
                {submitError}
              </div>
            )}

            <div style={{ marginBottom: '1.25rem' }}>
              <label
                htmlFor="ad-hoc-title"
                style={{
                  display: 'block',
                  marginBottom: '0.5rem',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  color: '#374151',
                }}
              >
                Inspection name <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                id="ad-hoc-title"
                name="title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                autoComplete="off"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: '1rem',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <label
                htmlFor="ad-hoc-date"
                style={{
                  display: 'block',
                  marginBottom: '0.5rem',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  color: '#374151',
                }}
              >
                Inspection date
              </label>
              <input
                id="ad-hoc-date"
                name="inspection_date"
                type="date"
                value={inspectionDate}
                onChange={(e) => setInspectionDate(e.target.value)}
                style={{
                  width: '100%',
                  maxWidth: '16rem',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: '1rem',
                }}
              />
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <label
                htmlFor="ad-hoc-location"
                style={{
                  display: 'block',
                  marginBottom: '0.5rem',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  color: '#374151',
                }}
              >
                Location
              </label>
              <input
                id="ad-hoc-location"
                name="location"
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Estate, block, or area"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: '1rem',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label
                htmlFor="ad-hoc-notes"
                style={{
                  display: 'block',
                  marginBottom: '0.5rem',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  color: '#374151',
                }}
              >
                Notes
              </label>
              <textarea
                id="ad-hoc-notes"
                name="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                placeholder="Optional notes…"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: '1rem',
                  fontFamily: 'inherit',
                  resize: 'vertical',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false)
                  setSubmitError(null)
                }}
                style={{
                  padding: '0.75rem 1.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.5rem',
                  backgroundColor: '#fff',
                  color: '#374151',
                  fontWeight: 500,
                  cursor: 'pointer',
                  fontSize: '1rem',
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                style={{
                  padding: '0.75rem 1.5rem',
                  backgroundColor: isSubmitting ? '#9ca3af' : '#0f766e',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.5rem',
                  fontSize: '1rem',
                  fontWeight: 600,
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                }}
              >
                {isSubmitting ? 'Saving…' : 'Create'}
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  )
}
