'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import InspectionFullPdfControls from '@/app/components/InspectionFullPdfControls'

const INTERNAL_TABS = [
  { id: 'summary', label: 'Summary', icon: '📋' },
  { id: 'schedules', label: 'Manage Schedules', icon: '🗂️' },
  { id: 'inspections', label: 'Manage Inspections', icon: '📄' },
]

/** Filter panel tabs (Manage Inspections list view only) — layout only; fields map to existing `filters` keys. */
const INSPECTION_FILTER_TABS = [
  { id: 'users', label: 'Users' },
  { id: 'templates', label: 'Templates' },
  { id: 'locations', label: 'Locations' },
  { id: 'gradings', label: 'Gradings' },
  { id: 'dates', label: 'Date Range' },
]

/** Local calendar YYYY-MM-DD; aligns with `<input type="date">` (avoids UTC vs local mix from `new Date('YYYY-MM-DD')`). */
function localDateKeyFromTimestamp(iso) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function InspectionsListPage() {
  const [inspections, setInspections] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('summary')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [inspectionFilterTab, setInspectionFilterTab] = useState('users')
  const [filters, setFilters] = useState({
    dateFrom: '',
    dateTo: '',
    type: 'all',
    search: '',
    /** inspector email; matches inspections.inspector_id — owner/admin only in API */
    inspector: 'all',
    /** active = drafts & in-progress (default); completed = submitted only; all = both */
    completionScope: 'active',
  })
  const [inspectorOptions, setInspectorOptions] = useState([])
  const [inspectorPickerLoading, setInspectorPickerLoading] = useState(false)
  const [inspectorPickerMeta, setInspectorPickerMeta] = useState({
    canFilterByInspector: false,
    groupsAvailable: false,
    message: null,
  })

  const pathname = usePathname()
  const prevPathRef = useRef(null)

  const buildInspectionsApiUrl = () => {
    const params = new URLSearchParams()
    if (filters.dateFrom) params.set('dateFrom', filters.dateFrom)
    if (filters.dateTo) params.set('dateTo', filters.dateTo)
    if (filters.type && filters.type !== 'all') params.set('type', filters.type)
    if (filters.search && filters.search.trim()) params.set('search', filters.search.trim())
    if (filters.inspector && filters.inspector !== 'all') params.set('inspector', filters.inspector)
    if (filters.completionScope) params.set('completionScope', filters.completionScope)
    const qs = params.toString()
    return qs ? `/api/inspections?${qs}` : '/api/inspections'
  }

  const reloadInspections = useCallback(async () => {
    try {
      const res = await fetch(buildInspectionsApiUrl(), { credentials: 'include', cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      if (Array.isArray(data)) setInspections(data)
    } catch {
      /* ignore */
    }
  }, [filters])

  useEffect(() => {
    const isList = pathname === '/inspections' || pathname === '/inspections/'
    if (!isList) {
      prevPathRef.current = pathname
      return
    }

    // Entering the list from outside /inspections/* (e.g. dashboard after submit): reset type/search so
    // Street/Block/Estate filters do not hide type=inspection rows; keep date range unless user prefers otherwise.
    const prev = prevPathRef.current
    const cameFromOutsideInspections =
      prev != null && prev !== '' && !prev.startsWith('/inspections')
    if (cameFromOutsideInspections) {
      setFilters((f) => ({ ...f, type: 'all', search: '', inspector: 'all', completionScope: 'active' }))
    }
    prevPathRef.current = pathname

    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(buildInspectionsApiUrl(), { credentials: 'include', cache: 'no-store' })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          const msg = [data?.error, data?.details].filter(Boolean).join(' — ')
          throw new Error(msg || `Request failed: ${res.status}`)
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
  }, [pathname, filters])

  // Back-forward cache restore can resurrect a stale list without remounting; refetch when page is shown from bfcache.
  useEffect(() => {
    const onPageShow = (e) => {
      if (!e.persisted) return
      const p = window.location?.pathname || ''
      if (p !== '/inspections' && p !== '/inspections/') return
      ;(async () => {
        try {
          const res = await fetch(buildInspectionsApiUrl(), { credentials: 'include', cache: 'no-store' })
          if (!res.ok) return
          const data = await res.json()
          if (Array.isArray(data)) setInspections(data)
        } catch {
          /* ignore */
        }
      })()
    }
    window.addEventListener('pageshow', onPageShow)
    return () => window.removeEventListener('pageshow', onPageShow)
  }, [filters])

  useEffect(() => {
    const isList = pathname === '/inspections' || pathname === '/inspections/'
    if (!isList || activeTab !== 'inspections') return
    let cancelled = false
    ;(async () => {
      setInspectorPickerLoading(true)
      try {
        const res = await fetch('/api/inspections/inspectors', { credentials: 'include', cache: 'no-store' })
        const data = await res.json().catch(() => ({}))
        if (cancelled) return
        if (!res.ok) {
          setInspectorOptions([])
          setInspectorPickerMeta({
            canFilterByInspector: false,
            groupsAvailable: false,
            message: data?.details || data?.error || 'Could not load inspectors',
          })
          return
        }
        setInspectorOptions(Array.isArray(data.inspectors) ? data.inspectors : [])
        setInspectorPickerMeta({
          canFilterByInspector: data.canFilterByInspector === true,
          groupsAvailable: data.groupsAvailable === true,
          message: data.message || null,
        })
      } catch {
        if (!cancelled) {
          setInspectorOptions([])
          setInspectorPickerMeta({
            canFilterByInspector: false,
            groupsAvailable: false,
            message: 'Could not load inspectors',
          })
        }
      } finally {
        if (!cancelled) setInspectorPickerLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [pathname, activeTab])

  const formatDate = (dateString) => {
    if (!dateString) return '–'
    const d = new Date(dateString)
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'numeric', year: 'numeric' })
  }

  const locationDisplay = (row) =>
    row.location_label?.trim() ||
    [row.estate_name, row.block_name].filter(Boolean).join(' · ') ||
    '–'

  const freqDisplay = (row) => {
    if (row.is_scheduled === true) return 'Scheduled'
    if (row.is_scheduled === false) return 'Ad hoc'
    return '–'
  }

  /** Aligns DB `type` strings with filter option values (see photobook import: estate_walkabout). */
  const normalizeInspectionType = (raw) =>
    String(raw || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/-/g, '_')

  const rowMatchesTypeFilter = (rowType, filterType) => {
    if (filterType === 'all') return true
    const row = normalizeInspectionType(rowType)
    const f = normalizeInspectionType(filterType)
    if (row === f) return true
    if (f === 'estate' && row === 'estate_walkabout') return true
    return false
  }

  const isSubmittedRow = (row) => String(row.status || '').toLowerCase() === 'submitted'

  const filteredInspections = useMemo(() => inspections, [inspections])

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
        Work across inspections in one place: summaries, schedules, and the operational list for active and
        scheduled work. Reporting totals stay on Home; use filters here to focus drafts, in-progress, and due work.
      </p>

      {/* Section tabs (Summary / Schedules / Manage Inspections) */}
      <div
        role="tablist"
        aria-label="Manage inspections sections"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.5rem',
          marginBottom: '1rem',
        }}
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

      {activeTab === 'inspections' && (
        <p
          style={{
            margin: '0 0 1rem 0',
            fontSize: '0.875rem',
            color: '#6b7280',
            lineHeight: 1.55,
            maxWidth: '42rem',
          }}
        >
          Operational list for day-to-day work — open <strong style={{ color: '#374151', fontWeight: 600 }}>Show Filters</strong> to
          choose what appears (active, completed, or all), then use the tabs to narrow by scope, type, location, or dates.
        </p>
      )}

      {/* Summary / Schedules: quick scope + filters. Manage Inspections: filters only (scope lives in Users tab). */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'flex-end',
          justifyContent: activeTab === 'inspections' ? 'flex-end' : 'space-between',
          gap: '1rem',
          marginBottom: filtersOpen && activeTab === 'inspections' ? '1.25rem' : '1rem',
          minHeight: activeTab === 'inspections' ? '2.75rem' : undefined,
        }}
      >
        {activeTab !== 'inspections' && (
          <label
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.35rem',
              fontSize: '0.8125rem',
              color: '#374151',
              fontWeight: 500,
              minWidth: 'min(100%, 14rem)',
            }}
          >
            Show
            <select
              value={filters.completionScope}
              onChange={(e) => setFilters((f) => ({ ...f, completionScope: e.target.value }))}
              style={{
                padding: '0.55rem 0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
                fontSize: '0.875rem',
                backgroundColor: '#fff',
              }}
              aria-label="Show inspections"
            >
              <option value="active">Active work (drafts and in progress)</option>
              <option value="completed">Completed</option>
              <option value="all">All</option>
            </select>
          </label>
        )}
        <div style={activeTab === 'inspections' ? undefined : { marginLeft: 'auto' }}>
          <button
            type="button"
            onClick={() => setFiltersOpen((o) => !o)}
            aria-expanded={filtersOpen}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.65rem 1.25rem',
              backgroundColor: '#fff',
              color: '#374151',
              border: '2px solid #c026d3',
              borderRadius: '0.5rem',
              fontSize: '0.9375rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <span aria-hidden style={{ fontSize: '1rem' }}>{filtersOpen ? '▾' : '▸'}</span>
            {filtersOpen ? 'Hide Filters' : 'Show Filters'}
          </button>
        </div>
      </div>

      {filtersOpen && activeTab === 'inspections' && (
        <div
          style={{
            marginBottom: '1.75rem',
            border: '1px solid #e5e7eb',
            borderRadius: '0.5rem',
            overflow: 'hidden',
            backgroundColor: '#fff',
            boxShadow: '0 4px 14px rgba(0,0,0,0.06)',
          }}
        >
          <div
            role="tablist"
            aria-label="Inspection filters"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 0,
              backgroundColor: '#f3f4f6',
              borderBottom: '1px solid #e5e7eb',
            }}
          >
            {INSPECTION_FILTER_TABS.map((t) => {
              const sel = inspectionFilterTab === t.id
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={sel}
                  onClick={() => setInspectionFilterTab(t.id)}
                  style={{
                    padding: '0.85rem 1.15rem',
                    fontSize: '0.9375rem',
                    fontWeight: sel ? 600 : 500,
                    color: sel ? '#111827' : '#6b7280',
                    backgroundColor: sel ? '#fff' : 'transparent',
                    border: 'none',
                    borderBottom: sel ? '2px solid #0f766e' : '2px solid transparent',
                    cursor: 'pointer',
                    lineHeight: 1.3,
                  }}
                >
                  {t.label}
                </button>
              )
            })}
          </div>
          <div style={{ padding: '1.75rem 1.5rem 1.25rem' }}>
            {inspectionFilterTab === 'users' && (
              <div role="tabpanel">
                <h2 style={{ margin: '0 0 0.35rem 0', fontSize: '1.125rem', fontWeight: 700, color: '#111827' }}>
                  Users (inspectors)
                </h2>
                <p style={{ margin: '0 0 1rem 0', fontSize: '0.875rem', color: '#6b7280', lineHeight: 1.55, maxWidth: '42rem' }}>
                  Filter by the inspector on the record (<code style={{ fontSize: '0.8rem' }}>inspector_id</code>, usually
                  email). <strong>Groups</strong> are not implemented yet — this tab lists users only.
                </p>
                {inspectorPickerMeta.message && (
                  <p
                    style={{
                      margin: '0 0 1rem 0',
                      padding: '0.65rem 0.85rem',
                      backgroundColor: '#f9fafb',
                      border: '1px solid #e5e7eb',
                      borderRadius: '0.375rem',
                      fontSize: '0.8125rem',
                      color: '#4b5563',
                      lineHeight: 1.5,
                    }}
                  >
                    {inspectorPickerMeta.message}
                  </p>
                )}
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.8125rem',
                    marginBottom: '0.4rem',
                    color: '#374151',
                    fontWeight: 600,
                  }}
                >
                  Which inspections to show
                </label>
                <select
                  value={filters.completionScope}
                  onChange={(e) => setFilters((f) => ({ ...f, completionScope: e.target.value }))}
                  style={{
                    maxWidth: '22rem',
                    width: '100%',
                    padding: '0.55rem 0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    fontSize: '0.875rem',
                    backgroundColor: '#fff',
                    marginBottom: '1.25rem',
                  }}
                  aria-label="Which inspections to show"
                >
                  <option value="active">Active work (drafts and in progress)</option>
                  <option value="completed">Completed</option>
                  <option value="all">All</option>
                </select>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.8125rem',
                    marginBottom: '0.4rem',
                    color: '#374151',
                    fontWeight: 600,
                  }}
                >
                  Inspector (user)
                </label>
                {inspectorPickerLoading ? (
                  <p style={{ margin: '0 0 1rem 0', fontSize: '0.875rem', color: '#6b7280' }}>Loading inspectors…</p>
                ) : inspectorPickerMeta.canFilterByInspector ? (
                  <select
                    value={filters.inspector}
                    onChange={(e) => setFilters((f) => ({ ...f, inspector: e.target.value }))}
                    style={{
                      maxWidth: 'min(100%, 28rem)',
                      width: '100%',
                      padding: '0.55rem 0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem',
                      backgroundColor: '#fff',
                      marginBottom: '1rem',
                    }}
                    aria-label="Filter by inspector"
                  >
                    <option value="all">All inspectors</option>
                    {inspectorOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label} ({opt.value})
                      </option>
                    ))}
                  </select>
                ) : (
                  <p style={{ margin: '0 0 1rem 0', fontSize: '0.875rem', color: '#6b7280' }}>
                    Inspector filter is limited to your account for this role.
                  </p>
                )}
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontSize: '0.875rem',
                    color: '#9ca3af',
                    cursor: 'not-allowed',
                  }}
                >
                  <input type="checkbox" disabled style={{ width: '1rem', height: '1rem' }} />
                  Include deleted (not available)
                </label>
              </div>
            )}
            {inspectionFilterTab === 'templates' && (
              <div role="tabpanel">
                <h2 style={{ margin: '0 0 0.35rem 0', fontSize: '1.125rem', fontWeight: 700, color: '#111827' }}>
                  Filter by template type
                </h2>
                <p style={{ margin: '0 0 1rem 0', fontSize: '0.875rem', color: '#6b7280', lineHeight: 1.55 }}>
                  Limit the list to a single inspection type.
                </p>
                <label style={{ display: 'block', fontSize: '0.8125rem', marginBottom: '0.35rem', color: '#374151', fontWeight: 500 }}>
                  Type
                </label>
                <select
                  value={filters.type}
                  onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))}
                  style={{
                    maxWidth: '24rem',
                    width: '100%',
                    padding: '0.55rem 0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    fontSize: '0.875rem',
                    backgroundColor: '#fff',
                  }}
                >
                  <option value="all">All types</option>
                  <option value="inspection">Template (inspection)</option>
                  <option value="ad_hoc">Ad hoc</option>
                  <option value="street">Street</option>
                  <option value="block">Block</option>
                  <option value="estate">Estate</option>
                </select>
              </div>
            )}
            {inspectionFilterTab === 'locations' && (
              <div role="tabpanel">
                <h2 style={{ margin: '0 0 0.35rem 0', fontSize: '1.125rem', fontWeight: 700, color: '#111827' }}>
                  Filter by location
                </h2>
                <p style={{ margin: '0 0 1rem 0', fontSize: '0.875rem', color: '#6b7280', lineHeight: 1.55 }}>
                  Search text is matched against location labels (server-side).
                </p>
                <div style={{ position: 'relative', maxWidth: '32rem' }}>
                  <span
                    aria-hidden
                    style={{
                      position: 'absolute',
                      left: '0.75rem',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: '#9ca3af',
                      fontSize: '0.9rem',
                    }}
                  >
                    🔍
                  </span>
                  <input
                    type="search"
                    value={filters.search}
                    onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                    placeholder="Search locations…"
                    style={{
                      width: '100%',
                      padding: '0.65rem 0.75rem 0.65rem 2.25rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem',
                    }}
                  />
                </div>
              </div>
            )}
            {inspectionFilterTab === 'gradings' && (
              <div role="tabpanel">
                <h2 style={{ margin: '0 0 0.35rem 0', fontSize: '1.125rem', fontWeight: 700, color: '#111827' }}>
                  Filter by grading
                </h2>
                <p style={{ margin: 0, fontSize: '0.875rem', color: '#6b7280', lineHeight: 1.55, maxWidth: '36rem' }}>
                  Grading filters are not wired on this page yet; the list still uses the same API query as before.
                </p>
              </div>
            )}
            {inspectionFilterTab === 'dates' && (
              <div role="tabpanel">
                <h2 style={{ margin: '0 0 0.35rem 0', fontSize: '1.125rem', fontWeight: 700, color: '#111827' }}>
                  Date range
                </h2>
                <p style={{ margin: '0 0 1rem 0', fontSize: '0.875rem', color: '#6b7280', lineHeight: 1.55 }}>
                  Completed from / to (aligned with API date filters).
                </p>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '1rem',
                    maxWidth: '36rem',
                  }}
                >
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
                        padding: '0.55rem 0.75rem',
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
                        padding: '0.55rem 0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                        fontSize: '0.875rem',
                      }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
          <div style={{ padding: '0 1.5rem 1.25rem' }}>
            <button
              type="button"
              onClick={() =>
              setFilters({
                dateFrom: '',
                dateTo: '',
                type: 'all',
                search: '',
                inspector: 'all',
                completionScope: 'active',
              })
            }
              style={{
                padding: '0.5rem 1rem',
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
        </div>
      )}

      {filtersOpen && activeTab !== 'inspections' && (
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
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '1rem',
              marginBottom: '1rem',
            }}
          >
            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', marginBottom: '0.35rem', color: '#374151', fontWeight: 500 }}>
                Show
              </label>
              <select
                value={filters.completionScope}
                onChange={(e) => setFilters((f) => ({ ...f, completionScope: e.target.value }))}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.65rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem',
                }}
              >
                <option value="active">Active work</option>
                <option value="completed">Completed</option>
                <option value="all">All</option>
              </select>
            </div>
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
                <option value="inspection">Template (inspection)</option>
                <option value="ad_hoc">Ad hoc</option>
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
            onClick={() =>
              setFilters({
                dateFrom: '',
                dateTo: '',
                type: 'all',
                search: '',
                inspector: 'all',
                completionScope: 'active',
              })
            }
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
                            <InspectionFullPdfControls
                              inspectionId={row.id}
                              inspection={row}
                              pdfGenerationError={row.pdf_generation_error}
                              onAfterGenerate={reloadInspections}
                            />
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
