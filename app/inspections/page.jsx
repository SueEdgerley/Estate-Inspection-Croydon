'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'

const INTERNAL_TABS = [
  { id: 'summary', label: 'Summary', icon: '📋' },
  { id: 'schedules', label: 'Manage Schedules', icon: '🗂️' },
  { id: 'inspections', label: 'Manage Inspections', icon: '📄' },
]

export default function InspectionsListPage() {
  const [inspections, setInspections] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('summary')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [filters, setFilters] = useState({
    dateFrom: '',
    dateTo: '',
    type: 'all',
    search: '',
  })

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
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'numeric', year: 'numeric' })
  }

  const pdfUrl = (row) =>
    row.poster_pdf_url || row.full_pdf_url || row.pdf_url || null

  const locationDisplay = (row) =>
    row.location_label?.trim() ||
    [row.estate_name, row.block_name].filter(Boolean).join(' · ') ||
    '–'

  const freqDisplay = (row) => {
    if (row.is_scheduled === true) return 'Scheduled'
    if (row.is_scheduled === false) return 'Ad hoc'
    return '–'
  }

  const filteredInspections = useMemo(() => {
    return inspections.filter((row) => {
      const loc = locationDisplay(row).toLowerCase()
      if (filters.search && !loc.includes(filters.search.toLowerCase())) return false
      if (filters.type !== 'all' && (row.type || '').toLowerCase() !== filters.type) return false
      const completed = row.submitted_at || row.created_at
      if (filters.dateFrom && completed) {
        if (new Date(completed) < new Date(filters.dateFrom)) return false
      }
      if (filters.dateTo && completed) {
        const end = new Date(filters.dateTo)
        end.setHours(23, 59, 59, 999)
        if (new Date(completed) > end) return false
      }
      return true
    })
  }, [inspections, filters])

  const summaryRows = filteredInspections

  return (
    <div>
      <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 'bold', color: '#111827' }}>
        Manage Inspections
      </h1>
      <p style={{
        margin: '0.5rem 0 1.25rem 0',
        fontSize: '0.9375rem',
        color: '#6b7280',
        lineHeight: 1.5,
        maxWidth: '48rem',
      }}>
        Create and schedule new inspections here. View inspections in progress, edit series and manage
        existing inspections and schedules.
      </p>

      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
        marginBottom: '1rem',
      }}>
        <div
          role="tablist"
          aria-label="Manage inspections sections"
          style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}
        >
          {INTERNAL_TABS.map((tab) => {
            const selected = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.65rem 1.1rem',
                  fontSize: '0.9375rem',
                  fontWeight: selected ? 600 : 500,
                  color: selected ? '#111827' : '#6b7280',
                  backgroundColor: selected ? '#fff' : '#f3f4f6',
                  border: selected ? '1px solid #e5e7eb' : '1px solid transparent',
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                  boxShadow: selected ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                }}
              >
                <span aria-hidden>{tab.icon}</span>
                {tab.label}
              </button>
            )
          })}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => setFiltersOpen((o) => !o)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.65rem 1.15rem',
              backgroundColor: '#fff',
              color: '#374151',
              border: '2px solid #c026d3',
              borderRadius: '0.5rem',
              fontSize: '0.9375rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <span aria-hidden style={{ fontSize: '1rem' }}>⏷</span>
            Show Filters
          </button>
          <Link
            href="/inspections/new"
            style={{
              padding: '0.65rem 1.15rem',
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
      </div>

      {filtersOpen && (
        <div
          style={{
            backgroundColor: '#fff',
            padding: '1.25rem',
            borderRadius: '0.5rem',
            border: '1px solid #e5e7eb',
            boxShadow: '0 4px 6px rgba(0,0,0,0.06)',
            marginBottom: '1.25rem',
          }}
        >
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '1rem',
            marginBottom: '1rem',
          }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', marginBottom: '0.35rem', color: '#374151', fontWeight: 500 }}>
                Search location
              </label>
              <input
                type="search"
                value={filters.search}
                onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                placeholder="Filter by location text"
                style={{
                  width: '100%',
                  padding: '0.5rem 0.65rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem',
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', marginBottom: '0.35rem', color: '#374151', fontWeight: 500 }}>
                Type
              </label>
              <select
                value={filters.type}
                onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.65rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem',
                }}
              >
                <option value="all">All types</option>
                <option value="street">Street</option>
                <option value="block">Block</option>
                <option value="estate">Estate</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', marginBottom: '0.35rem', color: '#374151', fontWeight: 500 }}>
                Completed from
              </label>
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.65rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem',
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', marginBottom: '0.35rem', color: '#374151', fontWeight: 500 }}>
                Completed to
              </label>
              <input
                type="date"
                value={filters.dateTo}
                onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.65rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem',
                }}
              />
            </div>
          </div>
          <button
            type="button"
            onClick={() => setFilters({ dateFrom: '', dateTo: '', type: 'all', search: '' })}
            style={{
              padding: '0.45rem 0.9rem',
              backgroundColor: '#f3f4f6',
              color: '#374151',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '0.8125rem',
              cursor: 'pointer',
            }}
          >
            Clear filters
          </button>
        </div>
      )}

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

      {activeTab === 'summary' && (
        <div
          role="tabpanel"
          aria-labelledby="tab-summary"
          style={{
            backgroundColor: '#fff',
            borderRadius: '0.5rem',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            border: '1px solid #e5e7eb',
            overflow: 'hidden',
          }}
        >
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                  <th style={{ textAlign: 'left', padding: '0.75rem 1rem', fontWeight: 600, color: '#374151' }}>Type</th>
                  <th style={{ textAlign: 'left', padding: '0.75rem 1rem', fontWeight: 600, color: '#374151' }}>Location</th>
                  <th style={{ textAlign: 'left', padding: '0.75rem 1rem', fontWeight: 600, color: '#374151' }}>User</th>
                  <th style={{ textAlign: 'left', padding: '0.75rem 1rem', fontWeight: 600, color: '#374151' }}>Template</th>
                  <th style={{ textAlign: 'left', padding: '0.75rem 1rem', fontWeight: 600, color: '#374151' }}>Freq</th>
                  <th style={{ textAlign: 'left', padding: '0.75rem 1rem', fontWeight: 600, color: '#374151' }}>Start</th>
                  <th style={{ textAlign: 'left', padding: '0.75rem 1rem', fontWeight: 600, color: '#374151' }}>End</th>
                  <th style={{ textAlign: 'left', padding: '0.75rem 1rem', fontWeight: 600, color: '#374151' }}>Due</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
                      Loading…
                    </td>
                  </tr>
                ) : summaryRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
                      No inspections match the current filters.
                    </td>
                  </tr>
                ) : (
                  summaryRows.map((row) => (
                    <tr key={row.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '0.75rem 1rem', color: '#111827' }}>{row.type || '–'}</td>
                      <td style={{ padding: '0.75rem 1rem', color: '#374151' }}>{locationDisplay(row)}</td>
                      <td style={{ padding: '0.75rem 1rem', color: '#374151' }}>{row.inspector_name ?? '–'}</td>
                      <td style={{ padding: '0.75rem 1rem', color: '#374151' }}>{row.template_name ?? '–'}</td>
                      <td style={{ padding: '0.75rem 1rem', color: '#374151' }}>{freqDisplay(row)}</td>
                      <td style={{ padding: '0.75rem 1rem', color: '#374151' }}>{formatDate(row.created_at)}</td>
                      <td style={{ padding: '0.75rem 1rem', color: '#374151' }}>{formatDate(row.submitted_at)}</td>
                      <td style={{ padding: '0.75rem 1rem', color: '#374151' }}>{formatDate(row.due_date)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'schedules' && (
        <div
          role="tabpanel"
          style={{
            backgroundColor: '#fff',
            borderRadius: '0.5rem',
            border: '1px solid #e5e7eb',
            padding: '2.5rem',
            textAlign: 'center',
            color: '#6b7280',
            fontSize: '0.9375rem',
          }}
        >
          <p style={{ margin: 0 }}>Schedule management will appear here.</p>
        </div>
      )}

      {activeTab === 'inspections' && (
        <div role="tabpanel">
          {loading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
              Loading inspections…
            </div>
          ) : filteredInspections.length === 0 ? (
            <div style={{
              backgroundColor: '#fff',
              padding: '3rem',
              borderRadius: '0.5rem',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              textAlign: 'center',
              border: '1px solid #e5e7eb',
            }}>
              <p style={{ margin: 0, color: '#6b7280', fontSize: '1rem' }}>
                {inspections.length === 0
                  ? 'No inspections yet.'
                  : 'No inspections match the current filters.'}
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
                    {filteredInspections.map((row) => (
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
      )}
    </div>
  )
}
