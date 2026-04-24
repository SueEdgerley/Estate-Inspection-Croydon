'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { SignedIn, SignedOut, SignInButton, useAuth } from '@clerk/nextjs'
import { photobook } from '@/lib/photobook-theme'

function defaultQuarterYear() {
  const d = new Date()
  const q = Math.floor(d.getMonth() / 3) + 1
  return { quarter: String(q), year: String(d.getFullYear()) }
}

function escapeCsvCell(val) {
  return `"${String(val ?? '').replace(/"/g, '""')}"`
}

export default function InspectionsReportPage() {
  const { isSignedIn } = useAuth()
  const def = useMemo(() => defaultQuarterYear(), [])

  const [options, setOptions] = useState({
    areas: [],
    estates: [],
    blocks: [],
    types: [],
    templateNames: [],
  })
  const [optionsError, setOptionsError] = useState(null)

  const [useQuarter, setUseQuarter] = useState(true)
  const [quarter, setQuarter] = useState(def.quarter)
  const [year, setYear] = useState(def.year)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const [area, setArea] = useState('all')
  const [estateId, setEstateId] = useState('all')
  const [blockId, setBlockId] = useState('all')
  const [type, setType] = useState('all')
  const [templateName, setTemplateName] = useState('all')
  const [status, setStatus] = useState('submitted')
  const [locationSearch, setLocationSearch] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)

  useEffect(() => {
    if (!isSignedIn) return
    let cancelled = false
    fetch('/api/reports/inspections?optionsOnly=1', { credentials: 'include' })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (cancelled) return
        if (!ok) {
          setOptionsError(j?.error || 'Could not load filter options')
          return
        }
        setOptions({
          areas: Array.isArray(j.areas) ? j.areas : [],
          estates: Array.isArray(j.estates) ? j.estates : [],
          blocks: Array.isArray(j.blocks) ? j.blocks : [],
          types: Array.isArray(j.types) ? j.types : [],
          templateNames: Array.isArray(j.templateNames) ? j.templateNames : [],
        })
      })
      .catch((e) => {
        if (!cancelled) setOptionsError(e?.message || 'Options request failed')
      })
    return () => {
      cancelled = true
    }
  }, [isSignedIn])

  const blocksForEstate = useMemo(() => {
    if (estateId === 'all') return options.blocks
    return options.blocks.filter((b) => b.estate_id === estateId)
  }, [options.blocks, estateId])

  const buildQuery = useCallback(() => {
    const p = new URLSearchParams()
    if (useQuarter && quarter && year) {
      p.set('quarter', quarter)
      p.set('year', year)
    } else {
      if (dateFrom) p.set('dateFrom', dateFrom)
      if (dateTo) p.set('dateTo', dateTo)
    }
    if (area && area !== 'all') p.set('area', area)
    if (estateId && estateId !== 'all') p.set('estateId', estateId)
    if (blockId && blockId !== 'all') p.set('blockId', blockId)
    if (type && type !== 'all') p.set('type', type)
    if (templateName && templateName !== 'all') p.set('templateName', templateName)
    if (status) p.set('status', status)
    if (locationSearch.trim()) p.set('locationSearch', locationSearch.trim())
    return p.toString()
  }, [
    useQuarter,
    quarter,
    year,
    dateFrom,
    dateTo,
    area,
    estateId,
    blockId,
    type,
    templateName,
    status,
    locationSearch,
  ])

  const runReport = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const qs = buildQuery()
      const res = await fetch(`/api/reports/inspections?${qs}`, { credentials: 'include', cache: 'no-store' })
      const j = await res.json().catch(() => ({}))
      if (res.status === 403) {
        setError(j?.error || 'You do not have access to inspection reports.')
        setData(null)
        return
      }
      if (!res.ok) {
        setError(j?.details || j?.error || `Request failed (${res.status})`)
        setData(null)
        return
      }
      setData(j)
    } catch (e) {
      setError(e?.message || 'Failed to load report')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [buildQuery])

  useEffect(() => {
    if (isSignedIn) runReport()
    // Intentionally only on sign-in; further loads use "Apply filters".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn])

  const periodLabel = useMemo(() => {
    if (!data?.applied) return ''
    const a = data.applied
    if (a.quarter && a.year) return `Q${a.quarter} ${a.year}`
    if (a.dateFrom || a.dateTo) return [a.dateFrom, a.dateTo].filter(Boolean).join(' → ')
    return 'All dates'
  }, [data])

  const downloadCsv = () => {
    if (!data?.rows?.length) {
      window.alert('No rows to export. Run a report that returns inspections.')
      return
    }
    const headers = [
      'id',
      'status',
      'type',
      'template_name',
      'area',
      'estate_name',
      'block_name',
      'location_label',
      'submitted_at',
      'created_at',
    ]
    const lines = [
      headers.map(escapeCsvCell).join(','),
      ...data.rows.map((r) =>
        headers.map((h) => escapeCsvCell(r[h])).join(',')
      ),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `inspection-report-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const summaryCsv = () => {
    if (!data) return
    const lines = [
      ['Section', 'Label', 'Count'].map(escapeCsvCell).join(','),
      ['Total', 'inspections', data.total].map(escapeCsvCell).join(','),
      ...(data.byArea || []).map((r) => ['By area', r.area, r.count].map(escapeCsvCell).join(',')),
      ...(data.byLocation || []).map((r) => ['By location', r.label, r.count].map(escapeCsvCell).join(',')),
      ...(data.byTemplate || []).map((r) =>
        ['By inspection type (template)', r.template_name, r.count].map(escapeCsvCell).join(',')
      ),
      ...(data.byType || []).map((r) => ['By record type', r.type, r.count].map(escapeCsvCell).join(',')),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `inspection-report-summary-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-root { padding: 0 !important; max-width: 100% !important; }
        }
      `}</style>

      <SignedOut>
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <p style={{ color: '#6b7280', marginBottom: '1rem' }}>Sign in to view inspection reports.</p>
          <SignInButton mode="modal">
            <button
              type="button"
              style={{
                padding: '0.65rem 1.25rem',
                backgroundColor: photobook.primary,
                color: '#fff',
                border: 'none',
                borderRadius: '0.5rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Sign in
            </button>
          </SignInButton>
        </div>
      </SignedOut>

      <SignedIn>
        <div className="print-root" style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div className="no-print" style={{ marginBottom: '1.25rem' }}>
            <Link href="/reports" style={{ color: photobook.link, fontSize: '0.875rem' }}>
              ← Reports
            </Link>
          </div>

          <h1 style={{ margin: '0 0 0.35rem 0', fontSize: '1.75rem', color: photobook.heading }}>
            Inspections reporting
          </h1>
          <p style={{ margin: '0 0 1.25rem 0', color: photobook.primaryMuted, fontSize: '0.9375rem' }}>
            Counts and breakdowns from Neon (submitted and draft inspections). Set{' '}
            <strong>estates.area</strong> in admin or import to enable the Area filter.
          </p>

          {optionsError && (
            <div
              className="no-print"
              style={{
                padding: '0.75rem 1rem',
                backgroundColor: '#fef3c7',
                color: '#92400e',
                borderRadius: 8,
                marginBottom: '1rem',
              }}
            >
              {optionsError}
            </div>
          )}

          <div
            className="no-print"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: '0.75rem',
              padding: '1rem',
              backgroundColor: '#fff',
              borderRadius: 12,
              border: `1px solid ${photobook.softBorder}`,
              marginBottom: '1rem',
            }}
          >
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.8125rem' }}>
              <span style={{ fontWeight: 600, color: '#374151' }}>Use calendar quarter</span>
              <select
                value={useQuarter ? 'yes' : 'no'}
                onChange={(e) => setUseQuarter(e.target.value === 'yes')}
                style={{ padding: '0.45rem' }}
              >
                <option value="yes">Quarter + year</option>
                <option value="no">Custom date range</option>
              </select>
            </label>
            {useQuarter ? (
              <>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.8125rem' }}>
                  <span style={{ fontWeight: 600, color: '#374151' }}>Quarter</span>
                  <select value={quarter} onChange={(e) => setQuarter(e.target.value)} style={{ padding: '0.45rem' }}>
                    <option value="1">Q1 (Jan–Mar)</option>
                    <option value="2">Q2 (Apr–Jun)</option>
                    <option value="3">Q3 (Jul–Sep)</option>
                    <option value="4">Q4 (Oct–Dec)</option>
                  </select>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.8125rem' }}>
                  <span style={{ fontWeight: 600, color: '#374151' }}>Year</span>
                  <input
                    type="number"
                    min={2000}
                    max={2100}
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    style={{ padding: '0.45rem' }}
                  />
                </label>
              </>
            ) : (
              <>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.8125rem' }}>
                  <span style={{ fontWeight: 600, color: '#374151' }}>From</span>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    style={{ padding: '0.45rem' }}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.8125rem' }}>
                  <span style={{ fontWeight: 600, color: '#374151' }}>To</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    style={{ padding: '0.45rem' }}
                  />
                </label>
              </>
            )}

            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.8125rem' }}>
              <span style={{ fontWeight: 600, color: '#374151' }}>Area (estate)</span>
              <select value={area} onChange={(e) => setArea(e.target.value)} style={{ padding: '0.45rem' }}>
                <option value="all">All areas</option>
                {options.areas.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.8125rem' }}>
              <span style={{ fontWeight: 600, color: '#374151' }}>Estate</span>
              <select
                value={estateId}
                onChange={(e) => {
                  setEstateId(e.target.value)
                  setBlockId('all')
                }}
                style={{ padding: '0.45rem' }}
              >
                <option value="all">All estates</option>
                {options.estates.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                    {e.area ? ` (${e.area})` : ''}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.8125rem' }}>
              <span style={{ fontWeight: 600, color: '#374151' }}>Block / scheme</span>
              <select value={blockId} onChange={(e) => setBlockId(e.target.value)} style={{ padding: '0.45rem' }}>
                <option value="all">All blocks</option>
                {blocksForEstate.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.estate_name ? `${b.estate_name} — ` : ''}
                    {b.name}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.8125rem' }}>
              <span style={{ fontWeight: 600, color: '#374151' }}>Location text</span>
              <input
                placeholder="Search location_label…"
                value={locationSearch}
                onChange={(e) => setLocationSearch(e.target.value)}
                style={{ padding: '0.45rem' }}
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.8125rem' }}>
              <span style={{ fontWeight: 600, color: '#374151' }}>Inspection type (template name)</span>
              <select
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                style={{ padding: '0.45rem' }}
              >
                <option value="all">All templates</option>
                {options.templateNames.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.8125rem' }}>
              <span style={{ fontWeight: 600, color: '#374151' }}>Record type</span>
              <select value={type} onChange={(e) => setType(e.target.value)} style={{ padding: '0.45rem' }}>
                <option value="all">All types</option>
                {options.types.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.8125rem' }}>
              <span style={{ fontWeight: 600, color: '#374151' }}>Status</span>
              <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ padding: '0.45rem' }}>
                <option value="submitted">Submitted</option>
                <option value="draft">Draft / not submitted</option>
                <option value="all">All</option>
              </select>
            </label>
          </div>

          <div className="no-print" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.25rem' }}>
            <button
              type="button"
              onClick={() => runReport()}
              disabled={loading}
              style={{
                padding: '0.55rem 1.1rem',
                fontWeight: 600,
                backgroundColor: photobook.primary,
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                cursor: loading ? 'wait' : 'pointer',
              }}
            >
              {loading ? 'Loading…' : 'Apply filters'}
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              style={{
                padding: '0.55rem 1.1rem',
                fontWeight: 600,
                backgroundColor: '#fff',
                color: photobook.primary,
                border: `2px solid ${photobook.primary}`,
                borderRadius: 8,
                cursor: 'pointer',
              }}
            >
              Printable / Save as PDF
            </button>
            <button
              type="button"
              onClick={downloadCsv}
              disabled={!data?.rows?.length}
              style={{
                padding: '0.55rem 1.1rem',
                fontWeight: 600,
                backgroundColor: '#fff',
                color: '#0f766e',
                border: '2px solid #0f766e',
                borderRadius: 8,
                cursor: data?.rows?.length ? 'pointer' : 'not-allowed',
              }}
            >
              Export detail CSV
            </button>
            <button
              type="button"
              onClick={summaryCsv}
              disabled={!data}
              style={{
                padding: '0.55rem 1.1rem',
                fontWeight: 600,
                backgroundColor: '#fff',
                color: '#0f766e',
                border: '2px solid #0f766e',
                borderRadius: 8,
                cursor: data ? 'pointer' : 'not-allowed',
              }}
            >
              Export summary CSV
            </button>
          </div>

          {error && (
            <div
              style={{
                padding: '0.75rem 1rem',
                backgroundColor: '#fee2e2',
                color: '#991b1b',
                borderRadius: 8,
                marginBottom: '1rem',
              }}
            >
              {error}
            </div>
          )}

          {data && (
            <div style={{ backgroundColor: '#fff', borderRadius: 12, padding: '1.25rem', border: `1px solid ${photobook.softBorder}` }}>
              <div style={{ marginBottom: '1.25rem', borderBottom: '1px solid #e5e7eb', paddingBottom: '1rem' }}>
                <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                  {data.applied?.area ? (
                    <>
                      Area: <strong>{data.applied.area}</strong>
                      <br />
                    </>
                  ) : null}
                  Period: <strong>{periodLabel}</strong>
                  {data.applied?.estateId ? (
                    <>
                      <br />
                      Estate filter active
                    </>
                  ) : null}
                  {data.applied?.blockId ? (
                    <>
                      <br />
                      Block filter active
                    </>
                  ) : null}
                </div>
                <p style={{ margin: '0.75rem 0 0 0', fontSize: '1.35rem', fontWeight: 700, color: photobook.heading }}>
                  Total inspections: {data.total}
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem' }}>
                <section>
                  <h2 style={{ fontSize: '1rem', margin: '0 0 0.5rem 0', color: '#111827' }}>By inspection type (template)</h2>
                  <ul style={{ margin: 0, paddingLeft: '1.1rem', color: '#374151', fontSize: '0.9rem' }}>
                    {(data.byTemplate || []).map((row) => (
                      <li key={row.template_name} style={{ marginBottom: 4 }}>
                        {row.template_name}: <strong>{row.count}</strong>
                      </li>
                    ))}
                    {(!data.byTemplate || data.byTemplate.length === 0) && <li>—</li>}
                  </ul>
                </section>

                <section>
                  <h2 style={{ fontSize: '1rem', margin: '0 0 0.5rem 0', color: '#111827' }}>By record type</h2>
                  <ul style={{ margin: 0, paddingLeft: '1.1rem', color: '#374151', fontSize: '0.9rem' }}>
                    {(data.byType || []).map((row) => (
                      <li key={row.type} style={{ marginBottom: 4 }}>
                        {row.type}: <strong>{row.count}</strong>
                      </li>
                    ))}
                    {(!data.byType || data.byType.length === 0) && <li>—</li>}
                  </ul>
                </section>

                <section>
                  <h2 style={{ fontSize: '1rem', margin: '0 0 0.5rem 0', color: '#111827' }}>By area (estate field)</h2>
                  <ul style={{ margin: 0, paddingLeft: '1.1rem', color: '#374151', fontSize: '0.9rem' }}>
                    {(data.byArea || []).map((row) => (
                      <li key={row.area} style={{ marginBottom: 4 }}>
                        {row.area}: <strong>{row.count}</strong>
                      </li>
                    ))}
                    {(!data.byArea || data.byArea.length === 0) && <li>—</li>}
                  </ul>
                </section>

                <section style={{ gridColumn: '1 / -1' }}>
                  <h2 style={{ fontSize: '1rem', margin: '0 0 0.5rem 0', color: '#111827' }}>By location (block → estate → label)</h2>
                  <ul style={{ margin: 0, paddingLeft: '1.1rem', color: '#374151', fontSize: '0.9rem', columns: 2, columnGap: '2rem' }}>
                    {(data.byLocation || []).map((row) => (
                      <li key={row.label} style={{ marginBottom: 4, breakInside: 'avoid' }}>
                        {row.label}: <strong>{row.count}</strong>
                      </li>
                    ))}
                    {(!data.byLocation || data.byLocation.length === 0) && <li>—</li>}
                  </ul>
                </section>
              </div>

              {data.rows?.length > 0 && (
                <div style={{ marginTop: '1.5rem' }}>
                  <h2 className="no-print" style={{ fontSize: '1rem', margin: '0 0 0.5rem 0' }}>
                    Matching inspections (first {data.rows.length})
                  </h2>
                  <div className="no-print" style={{ overflowX: 'auto', fontSize: '0.78rem' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
                          {['id', 'status', 'type', 'template', 'area', 'estate', 'block', 'submitted'].map((h) => (
                            <th key={h} style={{ padding: '0.35rem', whiteSpace: 'nowrap' }}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {data.rows.slice(0, 50).map((r) => (
                          <tr key={r.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                            <td style={{ padding: '0.35rem' }}>
                              <Link href={`/inspections/${r.id}`} style={{ color: photobook.link }}>
                                {r.id.slice(0, 12)}…
                              </Link>
                            </td>
                            <td style={{ padding: '0.35rem' }}>{r.status}</td>
                            <td style={{ padding: '0.35rem' }}>{r.type}</td>
                            <td style={{ padding: '0.35rem' }}>{r.template_name}</td>
                            <td style={{ padding: '0.35rem' }}>{r.area || '—'}</td>
                            <td style={{ padding: '0.35rem' }}>{r.estate_name || '—'}</td>
                            <td style={{ padding: '0.35rem' }}>{r.block_name || '—'}</td>
                            <td style={{ padding: '0.35rem' }}>
                              {r.submitted_at ? new Date(r.submitted_at).toLocaleDateString('en-GB') : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="no-print" style={{ fontSize: '0.8rem', color: '#9ca3af', marginTop: '0.5rem' }}>
                    Full list included in &quot;Export detail CSV&quot; (up to 2,500 rows per request).
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </SignedIn>
    </>
  )
}
