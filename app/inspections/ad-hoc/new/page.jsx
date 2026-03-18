'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

const INSPECTION_TYPES = [
  { value: 'ad_hoc_walkabout', label: 'Ad hoc walkabout' },
  { value: 'estate_walkabout', label: 'Estate walkabout' },
  { value: 'block_walkabout', label: 'Block walkabout' },
  { value: 'follow_up', label: 'Follow-up check' },
  { value: 'health_safety', label: 'Health & safety' },
  { value: 'other', label: 'Other' },
]

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'submitted', label: 'Submitted' },
]

export default function NewAdHocInspectionPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [optionsError, setOptionsError] = useState(null)
  const [submitError, setSubmitError] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [estates, setEstates] = useState([])
  const [blocks, setBlocks] = useState([])
  const [people, setPeople] = useState([])

  const [inspectionDate, setInspectionDate] = useState('')
  const [estateId, setEstateId] = useState('')
  const [area, setArea] = useState('')
  const [blockId, setBlockId] = useState('')
  const [assignedPersonId, setAssignedPersonId] = useState('')
  const [assignedPersonName, setAssignedPersonName] = useState('')
  const [assignedPersonEmail, setAssignedPersonEmail] = useState('')
  const [inspectionType, setInspectionType] = useState(INSPECTION_TYPES[0].value)
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const [status, setStatus] = useState('draft')

  useEffect(() => {
    let cancelled = false
    const loadOptions = async () => {
      try {
        const res = await fetch('/api/inspections/ad-hoc/options', {
          credentials: 'include',
          cache: 'no-store',
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(data?.error || data?.details || `Request failed (${res.status})`)
        }
        if (!cancelled) {
          setEstates(Array.isArray(data?.estates) ? data.estates : [])
          setBlocks(Array.isArray(data?.blocks) ? data.blocks : [])
          setPeople(Array.isArray(data?.people) ? data.people : [])
        }
      } catch (error) {
        if (!cancelled) setOptionsError(error?.message || 'Failed to load ad hoc form options')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadOptions()
    return () => {
      cancelled = true
    }
  }, [])

  const visibleBlocks = useMemo(() => {
    if (!estateId) return blocks
    return blocks.filter((b) => !b.estate_id || b.estate_id === estateId)
  }, [blocks, estateId])

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitError(null)
    if (!inspectionDate || !area || !assignedPersonName || !inspectionType || !reason || !status) {
      setSubmitError('Please complete all required fields.')
      return
    }
    setIsSubmitting(true)
    try {
      const res = await fetch('/api/inspections/ad-hoc', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inspection_date: inspectionDate,
          estate_id: estateId || null,
          area,
          block_id: blockId || null,
          assigned_person_id: assignedPersonId,
          assigned_person_name: assignedPersonName,
          assigned_person_email: assignedPersonEmail || null,
          inspection_type: inspectionType,
          reason,
          notes,
          status,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.error || data?.details || `Create failed (${res.status})`)
      }
      const inspectionId = data?.inspectionId || data?.inspection?.id
      if (!inspectionId) {
        throw new Error('Created record but no inspection ID was returned.')
      }
      router.push(`/inspections/${inspectionId}`)
    } catch (error) {
      setSubmitError(error?.message || 'Failed to create ad hoc inspection')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <Link href="/inspections" style={{ color: '#3b82f6', textDecoration: 'none', fontSize: '0.875rem' }}>
          ← Back to Manage Inspections
        </Link>
        <h1 style={{ margin: '0.75rem 0 0 0', fontSize: '1.9rem', fontWeight: 700 }}>
          New Ad Hoc Inspection
        </h1>
        <p style={{ margin: '0.5rem 0 0 0', color: '#6b7280', fontSize: '0.95rem' }}>
          Quick manual record only. This does not open a template and does not produce grading.
        </p>
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <Link href="/inspections/new" style={{ color: '#0f766e', textDecoration: 'none', fontWeight: 600 }}>
          Complete Template Inspection →
        </Link>
      </div>

      {(optionsError || submitError) && (
        <div
          style={{
            padding: '0.9rem 1rem',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '0.5rem',
            color: '#991b1b',
            marginBottom: '1rem',
            fontSize: '0.92rem',
          }}
        >
          {optionsError || submitError}
        </div>
      )}

      {loading ? (
        <div style={{ padding: '1.5rem 0', color: '#6b7280' }}>Loading form…</div>
      ) : (
        <form
          onSubmit={handleSubmit}
          style={{
            backgroundColor: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '0.5rem',
            padding: '1.5rem',
            maxWidth: '820px',
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '1rem' }}>
            <div>
              <label htmlFor="inspection_date" style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>
                Date *
              </label>
              <input
                id="inspection_date"
                type="date"
                value={inspectionDate}
                onChange={(e) => setInspectionDate(e.target.value)}
                required
                style={{ width: '100%', padding: '0.65rem', border: '1px solid #d1d5db', borderRadius: '0.4rem' }}
              />
            </div>

            <div>
              <label htmlFor="estate_id" style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>
                Estate
              </label>
              <select
                id="estate_id"
                value={estateId}
                onChange={(e) => {
                  setEstateId(e.target.value)
                  setBlockId('')
                }}
                style={{ width: '100%', padding: '0.65rem', border: '1px solid #d1d5db', borderRadius: '0.4rem' }}
              >
                <option value="">Select estate (optional)</option>
                {estates.map((estate) => (
                  <option key={estate.id} value={estate.id}>
                    {estate.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="block_id" style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>
                Block
              </label>
              <select
                id="block_id"
                value={blockId}
                onChange={(e) => setBlockId(e.target.value)}
                style={{ width: '100%', padding: '0.65rem', border: '1px solid #d1d5db', borderRadius: '0.4rem' }}
              >
                <option value="">Select block (optional)</option>
                {visibleBlocks.map((block) => (
                  <option key={block.id} value={block.id}>
                    {block.name}{block.estate_name ? ` (${block.estate_name})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="assigned_person_id" style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>
                Assigned person (directory)
              </label>
              <select
                id="assigned_person_id"
                value={assignedPersonId}
                onChange={(e) => {
                  const nextId = e.target.value
                  setAssignedPersonId(nextId)
                  const selected = people.find((person) => person.id === nextId)
                  if (selected) {
                    setAssignedPersonName(selected.name || '')
                    setAssignedPersonEmail(selected.email || '')
                  }
                }}
                style={{ width: '100%', padding: '0.65rem', border: '1px solid #d1d5db', borderRadius: '0.4rem' }}
              >
                <option value="">Select person (optional)</option>
                {people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}{person.email ? ` (${person.email})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="inspection_type" style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>
                Inspection type *
              </label>
              <select
                id="inspection_type"
                value={inspectionType}
                onChange={(e) => setInspectionType(e.target.value)}
                required
                style={{ width: '100%', padding: '0.65rem', border: '1px solid #d1d5db', borderRadius: '0.4rem' }}
              >
                {INSPECTION_TYPES.map((typeOption) => (
                  <option key={typeOption.value} value={typeOption.value}>
                    {typeOption.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="status" style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>
                Status *
              </label>
              <select
                id="status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                required
                style={{ width: '100%', padding: '0.65rem', border: '1px solid #d1d5db', borderRadius: '0.4rem' }}
              >
                {STATUS_OPTIONS.map((statusOption) => (
                  <option key={statusOption.value} value={statusOption.value}>
                    {statusOption.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ marginTop: '1rem' }}>
            <label htmlFor="area" style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>
              Estate / area *
            </label>
            <input
              id="area"
              value={area}
              onChange={(e) => setArea(e.target.value)}
              required
              placeholder="e.g. Shrublands Estate - Entrance and bin store"
              style={{ width: '100%', padding: '0.65rem', border: '1px solid #d1d5db', borderRadius: '0.4rem' }}
            />
          </div>

          <div style={{ marginTop: '1rem' }}>
            <label htmlFor="reason" style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>
              Reason *
            </label>
            <input
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              placeholder="Why this ad hoc inspection is being created"
              style={{ width: '100%', padding: '0.65rem', border: '1px solid #d1d5db', borderRadius: '0.4rem' }}
            />
          </div>

          <div style={{ marginTop: '1rem' }}>
            <label htmlFor="assigned_person_name" style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>
              Assigned person *
            </label>
            <input
              id="assigned_person_name"
              value={assignedPersonName}
              onChange={(e) => setAssignedPersonName(e.target.value)}
              required
              placeholder="Name of person responsible"
              style={{ width: '100%', padding: '0.65rem', border: '1px solid #d1d5db', borderRadius: '0.4rem' }}
            />
          </div>

          <div style={{ marginTop: '1rem' }}>
            <label htmlFor="assigned_person_email" style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>
              Assigned person email
            </label>
            <input
              id="assigned_person_email"
              type="email"
              value={assignedPersonEmail}
              onChange={(e) => setAssignedPersonEmail(e.target.value)}
              placeholder="Optional email"
              style={{ width: '100%', padding: '0.65rem', border: '1px solid #d1d5db', borderRadius: '0.4rem' }}
            />
          </div>

          <div style={{ marginTop: '1rem' }}>
            <label htmlFor="notes" style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>
              Notes
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="Additional notes for staff"
              style={{ width: '100%', padding: '0.65rem', border: '1px solid #d1d5db', borderRadius: '0.4rem', resize: 'vertical' }}
            />
          </div>

          <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <Link
              href="/inspections"
              style={{
                padding: '0.7rem 1.2rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.5rem',
                textDecoration: 'none',
                color: '#374151',
                fontWeight: 600,
              }}
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                padding: '0.7rem 1.2rem',
                border: 'none',
                borderRadius: '0.5rem',
                backgroundColor: isSubmitting ? '#9ca3af' : '#0f766e',
                color: '#fff',
                fontWeight: 700,
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
              }}
            >
              {isSubmitting ? 'Saving…' : 'Create Ad Hoc Inspection'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
