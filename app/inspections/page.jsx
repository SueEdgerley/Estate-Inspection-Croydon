'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

export default function InspectionsListPage() {
  const [inspections, setInspections] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch('/api/inspections', { credentials: 'include', cache: 'no-store' })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data?.error || `Request failed: ${res.status}`)
        }
        const data = await res.json()
        setInspections(Array.isArray(data) ? data : [])
      } catch (e) {
        setError(e?.message || 'Failed to load inspections')
        setInspections([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const formatDate = (dateString) => {
    if (!dateString) return '–'
    const d = new Date(dateString)
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  const pdfUrl = (row) =>
    row.poster_pdf_url || row.full_pdf_url || row.pdf_url || null

  return (
    <div>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1.5rem',
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 'bold', color: '#111827' }}>
            Manage Inspections
          </h1>
          <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.9375rem', color: '#6b7280' }}>
            Inspection records from Postgres
          </p>
        </div>
        <Link
          href="/inspections/new"
          style={{
            padding: '0.75rem 1.25rem',
            backgroundColor: '#0f766e',
            color: '#fff',
            textDecoration: 'none',
            borderRadius: '0.5rem',
            fontWeight: 600,
            fontSize: '0.9375rem',
          }}
        >
          New Inspection
        </Link>
      </div>

      {error && (
        <div style={{
          padding: '1rem 1.25rem',
          backgroundColor: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '0.5rem',
          marginBottom: '1rem',
          color: '#991b1b',
          fontSize: '0.9375rem',
        }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
          Loading inspections…
        </div>
      ) : inspections.length === 0 ? (
        <div style={{
          backgroundColor: '#fff',
          padding: '3rem',
          borderRadius: '0.5rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          textAlign: 'center',
          border: '1px solid #e5e7eb',
        }}>
          <p style={{ margin: 0, color: '#6b7280', fontSize: '1rem' }}>
            No inspections yet.
          </p>
          <Link
            href="/inspections/new"
            style={{
              display: 'inline-block',
              marginTop: '1rem',
              padding: '0.75rem 1.25rem',
              backgroundColor: '#0f766e',
              color: '#fff',
              textDecoration: 'none',
              borderRadius: '0.5rem',
              fontWeight: 600,
            }}
          >
            New Inspection
          </Link>
        </div>
      ) : (
        <div style={{
          backgroundColor: '#fff',
          borderRadius: '0.5rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          border: '1px solid #e5e7eb',
          overflow: 'hidden',
        }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                  <th style={{ textAlign: 'left', padding: '0.75rem 1rem', fontWeight: 600, color: '#374151' }}>Inspection ID</th>
                  <th style={{ textAlign: 'left', padding: '0.75rem 1rem', fontWeight: 600, color: '#374151' }}>Estate</th>
                  <th style={{ textAlign: 'left', padding: '0.75rem 1rem', fontWeight: 600, color: '#374151' }}>Block</th>
                  <th style={{ textAlign: 'left', padding: '0.75rem 1rem', fontWeight: 600, color: '#374151' }}>Template Name</th>
                  <th style={{ textAlign: 'left', padding: '0.75rem 1rem', fontWeight: 600, color: '#374151' }}>Inspector</th>
                  <th style={{ textAlign: 'left', padding: '0.75rem 1rem', fontWeight: 600, color: '#374151' }}>Date</th>
                  <th style={{ textAlign: 'left', padding: '0.75rem 1rem', fontWeight: 600, color: '#374151' }}>Status</th>
                  <th style={{ textAlign: 'center', padding: '0.75rem 1rem', fontWeight: 600, color: '#374151' }}>Issues</th>
                  <th style={{ textAlign: 'left', padding: '0.75rem 1rem', fontWeight: 600, color: '#374151' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {inspections.map((row) => (
                  <tr
                    key={row.id}
                    style={{ borderBottom: '1px solid #f3f4f6' }}
                  >
                    <td style={{ padding: '0.75rem 1rem', color: '#111827', fontFamily: 'var(--font-geist-mono), monospace', fontSize: '0.8125rem' }}>
                      {row.id?.slice(0, 8) || '–'}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', color: '#374151' }}>{row.estate_name ?? '–'}</td>
                    <td style={{ padding: '0.75rem 1rem', color: '#374151' }}>{row.block_name ?? '–'}</td>
                    <td style={{ padding: '0.75rem 1rem', color: '#374151' }}>{row.template_name ?? '–'}</td>
                    <td style={{ padding: '0.75rem 1rem', color: '#374151' }}>{row.inspector_name ?? '–'}</td>
                    <td style={{ padding: '0.75rem 1rem', color: '#374151' }}>{formatDate(row.submitted_at || row.created_at)}</td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <span style={{
                        padding: '0.2rem 0.5rem',
                        borderRadius: '9999px',
                        fontSize: '0.75rem',
                        fontWeight: 500,
                        backgroundColor: row.status === 'submitted' ? '#d1fae5' : '#f3f4f6',
                        color: row.status === 'submitted' ? '#065f46' : '#6b7280',
                      }}>
                        {row.status ?? 'draft'}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center', color: '#374151' }}>
                      {row.issues_count != null ? row.issues_count : '–'}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <Link
                          href={`/inspections/${row.id}`}
                          style={{ color: '#0f766e', textDecoration: 'none', fontWeight: 500, fontSize: '0.8125rem' }}
                        >
                          View
                        </Link>
                        {pdfUrl(row) ? (
                          <a
                            href={pdfUrl(row)}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: '#0f766e', textDecoration: 'none', fontWeight: 500, fontSize: '0.8125rem' }}
                          >
                            Download PDF
                          </a>
                        ) : (
                          <span style={{ color: '#9ca3af', fontSize: '0.8125rem' }}>Download PDF</span>
                        )}
                        <Link
                          href={`/actions?inspection_id=${encodeURIComponent(row.id)}`}
                          style={{ color: '#0f766e', textDecoration: 'none', fontWeight: 500, fontSize: '0.8125rem' }}
                        >
                          View Tasks
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
