'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { photobook } from '@/lib/photobook-theme'

function formatSubmittedAt(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export default function CaretakerMyInspectionsPage() {
  const [inspections, setInspections] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    fetch('/api/caretaker/my-inspections', { credentials: 'include', cache: 'no-store' })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.error || `Could not load (${res.status})`)
        return data
      })
      .then((data) => {
        if (cancelled) return
        setInspections(Array.isArray(data.inspections) ? data.inspections : [])
        setError('')
      })
      .catch((err) => {
        if (!cancelled) {
          setInspections([])
          setError(err?.message || 'Could not load your inspections')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 700, color: '#111827' }}>
          My inspections
        </h1>
        <p style={{ margin: '0.5rem 0 0', color: '#6b7280', lineHeight: 1.5, fontSize: '0.9375rem' }}>
          Submitted inspections are locked as evidence. Use <strong>Add follow-up note</strong> to append follow-up notes only.
        </p>
      </div>

      {loading ? <p style={{ color: '#6b7280' }}>Loading…</p> : null}
      {error ? (
        <div
          style={{
            padding: '1rem',
            marginBottom: '1rem',
            backgroundColor: '#fef2f2',
            color: '#b91c1c',
            borderRadius: '0.5rem',
            fontSize: '0.875rem',
          }}
        >
          {error}
        </div>
      ) : null}

      {!loading && !error && inspections.length === 0 ? (
        <div
          style={{
            padding: '2rem 1.25rem',
            backgroundColor: '#fff',
            borderRadius: '0.5rem',
            border: '1px solid #e5e7eb',
            textAlign: 'center',
            color: '#6b7280',
          }}
        >
          <p style={{ margin: '0 0 1rem' }}>No submitted inspections yet.</p>
          <Link
            href="/templates"
            style={{
              display: 'inline-block',
              padding: '0.75rem 1.25rem',
              borderRadius: '0.5rem',
              backgroundColor: photobook.primary,
              color: '#fff',
              textDecoration: 'none',
              fontWeight: 700,
            }}
          >
            Start a new inspection
          </Link>
        </div>
      ) : null}

      {!loading && inspections.length > 0 ? (
        <div style={{ display: 'grid', gap: '0.85rem' }}>
          {inspections.map((row) => {
            const locationLine = [row.estate_name, row.block_name, row.location_label].filter(Boolean).join(' · ')
            const detailHref = `/caretaker/inspections/${encodeURIComponent(row.id)}`
            const addUpdateHref = `${detailHref}?addUpdate=1#follow-up-updates`
            return (
              <div
                key={row.id}
                style={{
                  backgroundColor: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.75rem',
                  padding: '1rem',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: '1rem', color: '#111827', marginBottom: '0.25rem' }}>
                  {row.template_name || 'Caretaker inspection'}
                </div>
                <div style={{ fontSize: '0.875rem', color: '#475569', marginBottom: '0.25rem' }}>
                  {locationLine || 'Location not recorded'}
                </div>
                <div style={{ fontSize: '0.8125rem', color: '#6b7280', marginBottom: '0.75rem' }}>
                  Submitted {formatSubmittedAt(row.submitted_at)}
                  {row.scope_label ? ` · ${row.scope_label}` : ''}
                  {row.update_count ? ` · ${row.update_count} update${row.update_count === 1 ? '' : 's'}` : ''}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <Link
                    href={detailHref}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minHeight: 48,
                      borderRadius: '0.5rem',
                      border: '1px solid #d1d5db',
                      backgroundColor: '#fff',
                      color: '#374151',
                      textDecoration: 'none',
                      fontWeight: 600,
                      fontSize: '0.9375rem',
                    }}
                  >
                    View
                  </Link>
                  <Link
                    href={addUpdateHref}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minHeight: 48,
                      borderRadius: '0.5rem',
                      border: 'none',
                      backgroundColor: '#0f766e',
                      color: '#fff',
                      textDecoration: 'none',
                      fontWeight: 700,
                      fontSize: '1rem',
                    }}
                  >
                    Add follow-up note
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      ) : null}

      <p style={{ marginTop: '1.25rem', fontSize: '0.875rem' }}>
        <Link href="/templates" style={{ color: photobook.link, textDecoration: 'none', fontWeight: 500 }}>
          ← Back to Forms
        </Link>
      </p>
    </div>
  )
}
