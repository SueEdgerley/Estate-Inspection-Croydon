'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { SignedIn, SignedOut, SignInButton, useAuth } from '@clerk/nextjs'
import { photobook } from '@/lib/photobook-theme'
import OverviewTab from '@/app/components/analytics/OverviewTab'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'estates', label: 'Estates & blocks' },
  { id: 'issues', label: 'Issues & hotspots' },
  { id: 'trends', label: 'Trends' },
  { id: 'performance', label: 'Performance' },
  { id: 'grades', label: 'C / D grades' },
]

function defaultQuarterYear() {
  const d = new Date()
  return { q: String(Math.floor(d.getMonth() / 3) + 1), y: String(d.getFullYear()) }
}

function formatMonthLabel(isoDate) {
  if (!isoDate) return '—'
  const d = new Date(isoDate)
  if (Number.isNaN(d.getTime())) return String(isoDate)
  return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
}

function escapeCsvCell(val) {
  return `"${String(val ?? '').replace(/"/g, '""')}"`
}

export default function AnalyticsPage() {
  const { isSignedIn } = useAuth()
  const defQy = useMemo(() => defaultQuarterYear(), [])
  const [tab, setTab] = useState('overview')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [authCode, setAuthCode] = useState(null)
  const [message, setMessage] = useState(null)
  const [payload, setPayload] = useState(null)
  const [showAnalyticsHelp, setShowAnalyticsHelp] = useState(false)

  const [preset, setPreset] = useState('quarter')
  const [quarter, setQuarter] = useState(defQy.q)
  const [year, setYear] = useState(defQy.y)
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [caretaker, setCaretaker] = useState('all')
  const [issueCategory, setIssueCategory] = useState('all')
  const [issueDateFrom, setIssueDateFrom] = useState('')
  const [issueDateTo, setIssueDateTo] = useState('')
  const [gradeCategory, setGradeCategory] = useState('all')
  const [gradeBlockId, setGradeBlockId] = useState('all')
  const [gradeArea, setGradeArea] = useState('all')
  const [gradeTemplateName, setGradeTemplateName] = useState('all')

  const buildQuery = useCallback(() => {
    const p = new URLSearchParams()
    p.set('preset', preset)
    if (preset === 'quarter') {
      p.set('quarter', quarter)
      p.set('year', year)
    }
    if (preset === 'custom') {
      if (customFrom) p.set('dateFrom', customFrom)
      if (customTo) p.set('dateTo', customTo)
    }
    if (caretaker !== 'all') p.set('caretaker', caretaker)
    if (issueCategory !== 'all') p.set('issueCategory', issueCategory)
    if (issueDateFrom) p.set('issueDateFrom', issueDateFrom)
    if (issueDateTo) p.set('issueDateTo', issueDateTo)
    if (gradeCategory !== 'all') p.set('gradeCategory', gradeCategory)
    if (gradeBlockId !== 'all') p.set('gradeBlockId', gradeBlockId)
    if (gradeArea !== 'all') p.set('gradeArea', gradeArea)
    if (gradeTemplateName !== 'all') p.set('gradeTemplateName', gradeTemplateName)
    return p.toString()
  }, [
    preset,
    quarter,
    year,
    customFrom,
    customTo,
    caretaker,
    issueCategory,
    issueDateFrom,
    issueDateTo,
    gradeCategory,
    gradeBlockId,
    gradeArea,
    gradeTemplateName,
  ])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    setAuthCode(null)
    setMessage(null)
    try {
      const qs = buildQuery()
      const res = await fetch(`/api/analytics?${qs}`, { credentials: 'include', cache: 'no-store' })
      const data = await res.json()

      if (res.status === 401) {
        setAuthCode('UNAUTHORIZED')
        setPayload(null)
        return
      }
      if (res.status === 403 && data?.code) {
        setAuthCode(data.code)
        setPayload(null)
        return
      }
      if (!res.ok) {
        throw new Error(data?.details || data?.error || `Request failed (${res.status})`)
      }

      setPayload(data)
      if (data?.message) setMessage(data.message)
    } catch (e) {
      setError(e?.message || 'Failed to load analytics')
      setPayload(null)
    } finally {
      setLoading(false)
    }
  }, [buildQuery])

  useEffect(() => {
    if (isSignedIn) load()
  }, [isSignedIn, load])

  const overview = payload?.overview
  const estates = payload?.estates ?? []
  const blocks = payload?.blocks ?? []
  const issues = payload?.issues
  const trends = payload?.trends
  const performance = payload?.performance
  const gradeRisk = payload?.gradeRisk
  const filterOptions = payload?.filterOptions
  const applied = payload?.applied

  const exportAnalyticsCsv = () => {
    if (!payload) return
    const lines = []
    lines.push(['Section', 'Key', 'Value'].map(escapeCsvCell).join(','))
    if (overview) {
      lines.push(['Overview', 'completed_inspections', overview.completedInspections].map(escapeCsvCell).join(','))
      lines.push(['Overview', 'overall_score', overview.overallScore ?? ''].map(escapeCsvCell).join(','))
    }
    ;(performance?.caretakerCompleted || []).forEach((r) => {
      lines.push(['Caretaker completed', r.caretakerLabel, r.completedCount].map(escapeCsvCell).join(','))
    })
    ;(issues?.hotBlocks || []).forEach((r) => {
      lines.push(['Hot block', `${r.estate_name} / ${r.block_name}`, r.issue_count].map(escapeCsvCell).join(','))
    })
    if (gradeRisk && !gradeRisk.error) {
      lines.push(['C/D answers', 'count', gradeRisk.cdAnswerCount].map(escapeCsvCell).join(','))
      lines.push(['C/D distinct blocks', 'count', gradeRisk.distinctBlocks].map(escapeCsvCell).join(','))
      lines.push(['C/D distinct estates', 'count', gradeRisk.distinctEstates].map(escapeCsvCell).join(','))
      ;(gradeRisk.byMonth || []).forEach((m) => {
        lines.push(['C/D by month', m.month_start, m.cd_count].map(escapeCsvCell).join(','))
      })
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const u = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = u
    a.download = `analytics-export-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(u)
  }

  const maxVolume = useMemo(() => {
    const v = trends?.volumeByMonth ?? []
    return Math.max(1, ...v.map((m) => Number(m.inspection_count) || 0))
  }, [trends])

  const maxCaretaker = useMemo(() => {
    const v = performance?.caretakerCompleted ?? []
    return Math.max(1, ...v.map((r) => Number(r.completedCount) || 0))
  }, [performance])

  const maxCdMonth = useMemo(() => {
    const v = gradeRisk?.byMonth ?? []
    return Math.max(1, ...v.map((m) => Number(m.cd_count) || 0))
  }, [gradeRisk])

  return (
    <>
      <style>{`
        .analytics-print-only { display: none; }
        @media print {
          .analytics-no-print { display: none !important; }
          .analytics-print-root { padding: 0 !important; max-width: 100% !important; }
          .analytics-print-only { display: block !important; margin-bottom: 1rem; }
        }
      `}</style>
      <SignedOut>
        <div
          style={{
            minHeight: '50vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
          }}
        >
          <div style={{ textAlign: 'center', maxWidth: '28rem' }}>
            <p style={{ color: '#6b7280', marginBottom: '1.25rem' }}>Please sign in to view Analytics.</p>
            <SignInButton mode="modal" forceRedirectUrl="/analytics">
              <button
                type="button"
                style={{
                  padding: '0.75rem 1.5rem',
                  fontWeight: 600,
                  color: '#fff',
                  backgroundColor: photobook.primary,
                  border: 'none',
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                }}
              >
                Sign in
              </button>
            </SignInButton>
          </div>
        </div>
      </SignedOut>

      <SignedIn>
        <div className="analytics-print-root" style={{ maxWidth: '56rem', margin: '0 auto', padding: '0 1rem 2.5rem' }}>
          <div className="analytics-print-only" style={{ borderBottom: '1px solid #e5e7eb', paddingBottom: '0.75rem' }}>
            <h1 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 700, color: '#111827' }}>
              Estate inspection analytics (manager summary)
            </h1>
            <p style={{ margin: '0.35rem 0 0', fontSize: '0.85rem', color: '#6b7280' }}>
              Printed {new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
            </p>
          </div>
          <header
            className="analytics-no-print"
            style={{
              marginBottom: '1.5rem',
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: '1rem',
            }}
          >
            <div style={{ flex: '1 1 16rem', minWidth: 0 }}>
              <h1 style={{ margin: 0, fontSize: 'clamp(1.5rem, 4vw, 2rem)', fontWeight: 700, color: photobook.heading }}>
                Analytics
              </h1>
              <p style={{ margin: '0.35rem 0 0', color: '#6b7280', fontSize: '0.9375rem', lineHeight: 1.5 }}>
                Manager and HOS: caretaker throughput, issue hotspots, C/D graded answers, and trends.
              </p>
            </div>
            {!loading && !authCode && overview != null && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%', maxWidth: '20rem' }}>
                <button
                  type="button"
                  onClick={() => window.print()}
                  style={{
                    padding: '0.75rem 1.25rem',
                    minHeight: 48,
                    fontSize: '1rem',
                    fontWeight: 600,
                    color: '#fff',
                    backgroundColor: photobook.primary,
                    border: 'none',
                    borderRadius: '0.5rem',
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(192, 38, 211, 0.25)',
                  }}
                >
                  Print / save as PDF
                </button>
                <button
                  type="button"
                  onClick={exportAnalyticsCsv}
                  style={{
                    padding: '0.65rem 1rem',
                    fontWeight: 600,
                    color: photobook.primary,
                    backgroundColor: '#fff',
                    border: `2px solid ${photobook.primary}`,
                    borderRadius: '0.5rem',
                    cursor: 'pointer',
                  }}
                >
                  Export summary CSV
                </button>
                <button
                  type="button"
                  onClick={() => setShowAnalyticsHelp((v) => !v)}
                  style={{
                    margin: 0,
                    padding: '0.25rem 0.55rem',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: photobook.primary,
                    background: '#fff',
                    border: `1px solid ${photobook.softBorder}`,
                    borderRadius: 6,
                    cursor: 'pointer',
                    alignSelf: 'flex-start',
                  }}
                >
                  {showAnalyticsHelp ? 'Hide help' : 'Help'}
                </button>
                {showAnalyticsHelp ? (
                  <p style={{ margin: 0, fontSize: '0.75rem', color: '#6b7280', lineHeight: 1.4 }}>
                    Use <strong>Print / save as PDF</strong> so your browser produces the file (same as printing a web page).
                  </p>
                ) : null}
              </div>
            )}
          </header>

          <div
            className="analytics-no-print"
            style={{
              marginBottom: '1.25rem',
              padding: '1rem',
              backgroundColor: '#fff',
              border: `1px solid ${photobook.softBorder}`,
              borderRadius: '0.75rem',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
              gap: '0.65rem',
            }}
          >
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.78rem' }}>
              <span style={{ fontWeight: 600, color: '#374151' }}>Period</span>
              <select value={preset} onChange={(e) => setPreset(e.target.value)} style={{ padding: '0.4rem' }}>
                <option value="week">Last 7 days</option>
                <option value="month">This month</option>
                <option value="quarter">Quarter</option>
                <option value="custom">Custom</option>
              </select>
            </label>
            {preset === 'quarter' && (
              <>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.78rem' }}>
                  <span style={{ fontWeight: 600 }}>Quarter</span>
                  <select value={quarter} onChange={(e) => setQuarter(e.target.value)} style={{ padding: '0.4rem' }}>
                    <option value="1">Q1</option>
                    <option value="2">Q2</option>
                    <option value="3">Q3</option>
                    <option value="4">Q4</option>
                  </select>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.78rem' }}>
                  <span style={{ fontWeight: 600 }}>Year</span>
                  <input
                    type="number"
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    style={{ padding: '0.4rem' }}
                  />
                </label>
              </>
            )}
            {preset === 'custom' && (
              <>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.78rem' }}>
                  <span style={{ fontWeight: 600 }}>From</span>
                  <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.78rem' }}>
                  <span style={{ fontWeight: 600 }}>To</span>
                  <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
                </label>
              </>
            )}
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.78rem' }}>
              <span style={{ fontWeight: 600 }}>Caretaker (inspector)</span>
              <select value={caretaker} onChange={(e) => setCaretaker(e.target.value)} style={{ padding: '0.4rem' }}>
                <option value="all">All caretakers</option>
                {(filterOptions?.caretakers || []).map((c) => (
                  <option key={c.caretaker_id || c.caretaker_label} value={c.caretaker_id || c.caretaker_label}>
                    {c.caretaker_label}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.78rem' }}>
              <span style={{ fontWeight: 600 }}>Issue category (actions)</span>
              <select value={issueCategory} onChange={(e) => setIssueCategory(e.target.value)} style={{ padding: '0.4rem' }}>
                <option value="all">All categories</option>
                {(filterOptions?.issueCategories || []).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.78rem' }}>
              <span style={{ fontWeight: 600 }}>Issue from</span>
              <input type="date" value={issueDateFrom} onChange={(e) => setIssueDateFrom(e.target.value)} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.78rem' }}>
              <span style={{ fontWeight: 600 }}>Issue to</span>
              <input type="date" value={issueDateTo} onChange={(e) => setIssueDateTo(e.target.value)} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.78rem' }}>
              <span style={{ fontWeight: 600 }}>C/D — grading scheme</span>
              <select value={gradeCategory} onChange={(e) => setGradeCategory(e.target.value)} style={{ padding: '0.4rem' }}>
                <option value="all">All schemes</option>
                {(filterOptions?.gradingSchemes || []).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.78rem' }}>
              <span style={{ fontWeight: 600 }}>C/D — block</span>
              <select value={gradeBlockId} onChange={(e) => setGradeBlockId(e.target.value)} style={{ padding: '0.4rem' }}>
                <option value="all">All blocks</option>
                {(filterOptions?.blocks || []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.78rem' }}>
              <span style={{ fontWeight: 600 }}>C/D — area</span>
              <select value={gradeArea} onChange={(e) => setGradeArea(e.target.value)} style={{ padding: '0.4rem' }}>
                <option value="all">All areas</option>
                {(filterOptions?.areas || []).map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.78rem' }}>
              <span style={{ fontWeight: 600 }}>C/D — template</span>
              <select
                value={gradeTemplateName}
                onChange={(e) => setGradeTemplateName(e.target.value)}
                style={{ padding: '0.4rem' }}
              >
                <option value="all">All templates</option>
                {(filterOptions?.templateNames || []).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button
                type="button"
                onClick={() => load()}
                disabled={loading}
                style={{
                  padding: '0.55rem 1rem',
                  fontWeight: 600,
                  backgroundColor: photobook.primary,
                  color: '#fff',
                  border: 'none',
                  borderRadius: '0.5rem',
                  cursor: loading ? 'wait' : 'pointer',
                  width: '100%',
                }}
              >
                {loading ? 'Loading…' : 'Apply filters'}
              </button>
            </div>
          </div>

          {applied && overview != null && (
            <p className="analytics-no-print" style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '1rem' }}>
              Active window: <strong>{applied.preset}</strong>
              {applied.dateFrom || applied.dateTo
                ? ` (${applied.dateFrom || '…'} → ${applied.dateTo || '…'})`
                : ''}
              {applied.caretaker ? ` · Caretaker filter` : ''}
              {applied.issueCategory ? ` · Issues: ${applied.issueCategory}` : ''}
            </p>
          )}

          {!loading && !authCode && overview != null && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                gap: '0.75rem',
                marginBottom: '1.25rem',
              }}
            >
              {[
                { label: 'Completed inspections', value: overview.completedInspections },
                { label: 'Overall score (A–D avg)', value: overview.overallScore != null ? overview.overallScore.toFixed(2) : '—' },
                { label: 'Scheduled completion %', value: overview.completionRatePct != null ? `${overview.completionRatePct}%` : '—' },
                {
                  label: 'C/D answers (period)',
                  value: gradeRisk && !gradeRisk.error ? gradeRisk.cdAnswerCount : '—',
                },
              ].map((c) => (
                <div
                  key={c.label}
                  style={{
                    padding: '0.85rem',
                    borderRadius: '0.65rem',
                    border: `1px solid ${photobook.softBorder}`,
                    backgroundColor: '#fff',
                  }}
                >
                  <div style={{ fontSize: '0.72rem', color: '#6b7280', marginBottom: '0.25rem' }}>{c.label}</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: photobook.heading }}>{c.value}</div>
                </div>
              ))}
            </div>
          )}

          {loading && (
            <div
              style={{
                padding: '1rem 1.25rem',
                backgroundColor: '#f3f4f6',
                borderRadius: '0.5rem',
                marginBottom: '1rem',
                color: '#374151',
              }}
            >
              Loading analytics…
            </div>
          )}

          {!loading && authCode && (
            <div
              style={{
                padding: '1.25rem',
                backgroundColor: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '0.5rem',
                marginBottom: '1rem',
              }}
            >
              <p style={{ margin: 0, color: '#374151', lineHeight: 1.6 }}>
                {authCode === 'UNAUTHORIZED' && 'Please sign in again.'}
                {authCode === 'USER_NOT_PROVISIONED' && 'Your account is not set up yet. Ask an admin to assign your role.'}
                {authCode === 'USER_INACTIVE' && 'Your account is inactive.'}
                {authCode === 'ROLE_NOT_PERMITTED' &&
                  'You do not have access to Analytics. Ask an admin if you need the housing officer, ESM, or caretaker role.'}
              </p>
              {authCode === 'ROLE_NOT_PERMITTED' && (
                <p style={{ margin: '0.75rem 0 0' }}>
                  <Link href="/templates" style={{ color: photobook.link, fontWeight: 600 }}>
                    Go to Forms
                  </Link>
                </p>
              )}
            </div>
          )}

          {!loading && error && !authCode && (
            <div
              style={{
                padding: '1rem 1.25rem',
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '0.5rem',
                color: '#991b1b',
                marginBottom: '1rem',
              }}
            >
              {error}
            </div>
          )}

          {!loading && !authCode && message && (
            <div
              style={{
                marginBottom: '1rem',
                padding: '1rem 1.25rem',
                backgroundColor: '#FEF3C7',
                border: '1px solid #F59E0B',
                borderRadius: '0.5rem',
                color: '#92400E',
                fontSize: '0.9375rem',
              }}
            >
              {message}
            </div>
          )}

          {!loading && !authCode && payload && overview == null && !message && (
            <p style={{ color: '#6b7280' }}>No analytics data to show.</p>
          )}

          {!loading && !authCode && overview != null && (
            <>
              <nav
                className="analytics-no-print"
                role="tablist"
                aria-label="Analytics sections"
                style={{
                  display: 'flex',
                  gap: '0.35rem',
                  marginBottom: '1.25rem',
                  overflowX: 'auto',
                  WebkitOverflowScrolling: 'touch',
                  paddingBottom: '2px',
                  flexWrap: 'nowrap',
                  borderBottom: `1px solid ${photobook.softBorder}`,
                }}
              >
                {TABS.map((t) => {
                  const active = tab === t.id
                  return (
                    <button
                      key={t.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setTab(t.id)}
                      style={{
                        flex: '0 0 auto',
                        padding: '0.55rem 0.9rem',
                        fontSize: '0.875rem',
                        fontWeight: active ? 700 : 500,
                        color: active ? '#fff' : photobook.heading,
                        backgroundColor: active ? photobook.primary : '#fff',
                        border: `1px solid ${active ? photobook.primary : photobook.softBorder}`,
                        borderRadius: '0.375rem 0.375rem 0 0',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {t.label}
                    </button>
                  )
                })}
              </nav>

              <section role="tabpanel" aria-label={TABS.find((x) => x.id === tab)?.label} style={{ minHeight: '12rem' }}>
                {tab === 'overview' && (
                  <OverviewTab overview={overview} trends={trends} issues={issues} />
                )}

                {tab === 'estates' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <p style={{ margin: 0, fontSize: '0.875rem', color: '#6b7280' }}>
                      Compare average grades (1–4) and volumes by estate and block. Higher scores indicate better letter grades on average.
                    </p>
                    <div>
                      <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.05rem', color: photobook.heading }}>By estate</h2>
                      <div style={{ overflowX: 'auto', border: `1px solid ${photobook.softBorder}`, borderRadius: '0.5rem' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                          <thead>
                            <tr style={{ backgroundColor: photobook.soft, textAlign: 'left' }}>
                              <th style={{ padding: '0.65rem 0.75rem', fontWeight: 600 }}>Estate</th>
                              <th style={{ padding: '0.65rem 0.75rem', fontWeight: 600 }}>Inspections</th>
                              <th style={{ padding: '0.65rem 0.75rem', fontWeight: 600 }}>Avg. score</th>
                            </tr>
                          </thead>
                          <tbody>
                            {estates.length === 0 ? (
                              <tr>
                                <td colSpan={3} style={{ padding: '1rem', color: '#6b7280' }}>
                                  No data for this filter.
                                </td>
                              </tr>
                            ) : (
                              estates.map((row) => (
                                <tr key={row.estate_id || row.estate_name} style={{ borderTop: '1px solid #e5e7eb' }}>
                                  <td style={{ padding: '0.6rem 0.75rem' }}>{row.estate_name}</td>
                                  <td style={{ padding: '0.6rem 0.75rem' }}>{row.inspection_count}</td>
                                  <td style={{ padding: '0.6rem 0.75rem' }}>
                                    {row.avg_grade != null ? Number(row.avg_grade).toFixed(2) : '—'}
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    <div>
                      <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.05rem', color: photobook.heading }}>By block</h2>
                      <div style={{ overflowX: 'auto', border: `1px solid ${photobook.softBorder}`, borderRadius: '0.5rem' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                          <thead>
                            <tr style={{ backgroundColor: photobook.soft, textAlign: 'left' }}>
                              <th style={{ padding: '0.65rem 0.75rem', fontWeight: 600 }}>Block</th>
                              <th style={{ padding: '0.65rem 0.75rem', fontWeight: 600 }}>Estate</th>
                              <th style={{ padding: '0.65rem 0.75rem', fontWeight: 600 }}>Inspections</th>
                              <th style={{ padding: '0.65rem 0.75rem', fontWeight: 600 }}>Avg. score</th>
                            </tr>
                          </thead>
                          <tbody>
                            {blocks.length === 0 ? (
                              <tr>
                                <td colSpan={4} style={{ padding: '1rem', color: '#6b7280' }}>
                                  No data for this filter.
                                </td>
                              </tr>
                            ) : (
                              blocks.map((row) => (
                                <tr key={row.block_id || row.block_name} style={{ borderTop: '1px solid #e5e7eb' }}>
                                  <td style={{ padding: '0.6rem 0.75rem' }}>{row.block_name}</td>
                                  <td style={{ padding: '0.6rem 0.75rem', color: '#6b7280' }}>{row.estate_name || '—'}</td>
                                  <td style={{ padding: '0.6rem 0.75rem' }}>{row.inspection_count}</td>
                                  <td style={{ padding: '0.6rem 0.75rem' }}>
                                    {row.avg_grade != null ? Number(row.avg_grade).toFixed(2) : '—'}
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {tab === 'issues' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    {!issues && (
                      <p style={{ margin: 0, color: '#6b7280', fontSize: '0.9375rem' }}>
                        Task / action data is not available (database table missing or no access).
                      </p>
                    )}
                    {issues && (
                      <>
                        <div>
                          <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.05rem', color: photobook.heading }}>Most common categories</h2>
                          <ul style={{ margin: 0, paddingLeft: '1.2rem', color: '#374151', fontSize: '0.9375rem', lineHeight: 1.6 }}>
                            {(issues.categories || []).map((c) => (
                              <li key={c.category}>
                                <strong>{c.category}</strong> — {c.cnt}
                              </li>
                            ))}
                            {(!issues.categories || issues.categories.length === 0) && (
                              <li style={{ listStyle: 'none', marginLeft: '-1.2rem', color: '#6b7280' }}>No actions in period.</li>
                            )}
                          </ul>
                        </div>
                        <div>
                          <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.05rem', color: photobook.heading }}>Top reported titles</h2>
                          <ul style={{ margin: 0, paddingLeft: '1.2rem', color: '#374151', fontSize: '0.9375rem', lineHeight: 1.6 }}>
                            {(issues.topTitles || []).map((c) => (
                              <li key={c.title}>
                                {c.title} — {c.cnt}
                              </li>
                            ))}
                            {(!issues.topTitles || issues.topTitles.length === 0) && (
                              <li style={{ listStyle: 'none', marginLeft: '-1.2rem', color: '#6b7280' }}>No actions in period.</li>
                            )}
                          </ul>
                        </div>
                        <div>
                          <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.05rem', color: photobook.heading }}>Locations with most issues</h2>
                          <ul style={{ margin: 0, paddingLeft: '1.2rem', color: '#374151', fontSize: '0.9375rem', lineHeight: 1.6 }}>
                            {(issues.hotspots || []).map((c) => (
                              <li key={c.location_label}>
                                {c.location_label} — {c.issue_count}
                              </li>
                            ))}
                            {(!issues.hotspots || issues.hotspots.length === 0) && (
                              <li style={{ listStyle: 'none', marginLeft: '-1.2rem', color: '#6b7280' }}>No actions in period.</li>
                            )}
                          </ul>
                        </div>
                        <div>
                          <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.05rem', color: photobook.heading }}>Hot blocks (open actions)</h2>
                          <p style={{ margin: '0 0 0.5rem', fontSize: '0.8rem', color: '#6b7280' }}>
                            Counts use action <code>created_at</code> within the issue date window (or inspection period if left blank).
                          </p>
                          <ul style={{ margin: 0, paddingLeft: '1.2rem', color: '#374151', fontSize: '0.9375rem', lineHeight: 1.6 }}>
                            {(issues.hotBlocks || []).map((c) => (
                              <li key={`${c.block_id}-${c.block_name}`}>
                                <strong>{c.block_name}</strong>
                                {c.estate_name ? ` (${c.estate_name})` : ''} — {c.issue_count}
                              </li>
                            ))}
                            {(!issues.hotBlocks || issues.hotBlocks.length === 0) && (
                              <li style={{ listStyle: 'none', marginLeft: '-1.2rem', color: '#6b7280' }}>No block-level actions in period.</li>
                            )}
                          </ul>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {tab === 'trends' && trends && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div>
                      <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.05rem', color: photobook.heading }}>Average score by month</h2>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {(trends.scoresByMonth || []).length === 0 && (
                          <p style={{ color: '#6b7280', fontSize: '0.9375rem' }}>No monthly data in range.</p>
                        )}
                        {(trends.scoresByMonth || []).map((m) => (
                          <div
                            key={String(m.month_start)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.75rem',
                              fontSize: '0.875rem',
                              flexWrap: 'wrap',
                            }}
                          >
                            <span style={{ minWidth: '5.5rem', color: '#6b7280' }}>{formatMonthLabel(m.month_start)}</span>
                            <span style={{ fontWeight: 600, color: photobook.heading, minWidth: '2.5rem' }}>
                              {m.avg_grade != null ? Number(m.avg_grade).toFixed(2) : '—'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.05rem', color: photobook.heading }}>Inspection volume by month</h2>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                        {(trends.volumeByMonth || []).length === 0 && (
                          <p style={{ color: '#6b7280', fontSize: '0.9375rem' }}>No monthly data in range.</p>
                        )}
                        {(trends.volumeByMonth || []).map((m) => {
                          const n = Number(m.inspection_count) || 0
                          const pct = Math.round((n / maxVolume) * 100)
                          return (
                            <div key={String(m.month_start)}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.2rem' }}>
                                <span style={{ color: '#6b7280' }}>{formatMonthLabel(m.month_start)}</span>
                                <span style={{ fontWeight: 600, color: photobook.heading }}>{n}</span>
                              </div>
                              <div
                                style={{
                                  height: 8,
                                  backgroundColor: photobook.soft,
                                  borderRadius: 4,
                                  overflow: 'hidden',
                                }}
                              >
                                <div
                                  style={{
                                    width: `${pct}%`,
                                    height: '100%',
                                    backgroundColor: photobook.primary,
                                    borderRadius: 4,
                                  }}
                                />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {tab === 'performance' && performance && (
                  <div>
                    <p style={{ margin: '0 0 1rem', fontSize: '0.875rem', color: '#6b7280' }}>
                      <strong>Completed in period</strong> counts submitted inspections in the selected date window. Below: draft vs submitted
                      totals per name.
                    </p>
                    <h2 style={{ margin: '0 0 0.65rem', fontSize: '1.05rem', color: photobook.heading }}>Caretaker completions (submitted)</h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', marginBottom: '1.25rem' }}>
                      {(performance.caretakerCompleted || []).length === 0 && (
                        <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>No rows for this filter.</p>
                      )}
                      {(performance.caretakerCompleted || []).map((r) => {
                        const n = Number(r.completedCount) || 0
                        const pct = Math.round((n / maxCaretaker) * 100)
                        return (
                          <div key={r.caretakerLabel + (r.caretakerId || '')}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.2rem' }}>
                              <span style={{ color: '#374151', fontWeight: 600 }}>{r.caretakerLabel}</span>
                              <span style={{ fontWeight: 600, color: photobook.primary }}>{n}</span>
                            </div>
                            <div
                              style={{
                                height: 8,
                                backgroundColor: photobook.soft,
                                borderRadius: 4,
                                overflow: 'hidden',
                              }}
                            >
                              <div
                                style={{
                                  width: `${pct}%`,
                                  height: '100%',
                                  backgroundColor: photobook.primary,
                                  borderRadius: 4,
                                }}
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    <h2 style={{ margin: '0 0 0.65rem', fontSize: '1.05rem', color: photobook.heading }}>Draft vs submitted (all)</h2>
                    <div style={{ overflowX: 'auto', border: `1px solid ${photobook.softBorder}`, borderRadius: '0.5rem' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                        <thead>
                          <tr style={{ backgroundColor: photobook.soft, textAlign: 'left' }}>
                            <th style={{ padding: '0.65rem 0.75rem', fontWeight: 600 }}>Inspector</th>
                            <th style={{ padding: '0.65rem 0.75rem', fontWeight: 600 }}>Submitted</th>
                            <th style={{ padding: '0.65rem 0.75rem', fontWeight: 600 }}>Total</th>
                            <th style={{ padding: '0.65rem 0.75rem', fontWeight: 600 }}>Completion</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(performance.byInspector || []).length === 0 ? (
                            <tr>
                              <td colSpan={4} style={{ padding: '1rem', color: '#6b7280' }}>
                                No rows.
                              </td>
                            </tr>
                          ) : (
                            performance.byInspector.map((row) => (
                              <tr key={row.inspectorName} style={{ borderTop: '1px solid #e5e7eb' }}>
                                <td style={{ padding: '0.6rem 0.75rem' }}>{row.inspectorName}</td>
                                <td style={{ padding: '0.6rem 0.75rem' }}>{row.submitted}</td>
                                <td style={{ padding: '0.6rem 0.75rem' }}>{row.total}</td>
                                <td style={{ padding: '0.6rem 0.75rem' }}>{row.completionPct}%</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {tab === 'grades' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    {!gradeRisk && (
                      <p style={{ color: '#6b7280' }}>Graded-answer analytics view is not available on this database.</p>
                    )}
                    {gradeRisk?.error && (
                      <p style={{ color: '#b91c1c' }}>Could not load C/D analysis: {gradeRisk.error}</p>
                    )}
                    {gradeRisk && !gradeRisk.error && (
                      <>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '0.75rem' }}>
                          {[
                            { k: 'C/D answers', v: gradeRisk.cdAnswerCount },
                            { k: 'Distinct blocks', v: gradeRisk.distinctBlocks },
                            { k: 'Distinct estates', v: gradeRisk.distinctEstates },
                          ].map((x) => (
                            <div
                              key={x.k}
                              style={{
                                padding: '0.75rem',
                                borderRadius: '0.5rem',
                                border: `1px solid ${photobook.softBorder}`,
                                backgroundColor: '#fff',
                              }}
                            >
                              <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>{x.k}</div>
                              <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{x.v}</div>
                            </div>
                          ))}
                        </div>
                        <div>
                          <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.05rem', color: photobook.heading }}>C/D trend by month</h2>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {(gradeRisk.byMonth || []).length === 0 && (
                              <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>No C/D answers in this window.</p>
                            )}
                            {(gradeRisk.byMonth || []).map((m) => {
                              const n = Number(m.cd_count) || 0
                              const pct = Math.round((n / maxCdMonth) * 100)
                              return (
                                <div key={String(m.month_start)}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                                    <span style={{ color: '#6b7280' }}>{formatMonthLabel(m.month_start)}</span>
                                    <span style={{ fontWeight: 600 }}>{n}</span>
                                  </div>
                                  <div
                                    style={{
                                      height: 8,
                                      backgroundColor: photobook.soft,
                                      borderRadius: 4,
                                      overflow: 'hidden',
                                    }}
                                  >
                                    <div
                                      style={{
                                        width: `${pct}%`,
                                        height: '100%',
                                        backgroundColor: '#d97706',
                                        borderRadius: 4,
                                      }}
                                    />
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                        <div>
                          <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.05rem', color: photobook.heading }}>By grading scheme</h2>
                          <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.9rem', color: '#374151' }}>
                            {(gradeRisk.byScheme || []).map((s) => (
                              <li key={s.grading_scheme_name}>
                                {s.grading_scheme_name}: <strong>{s.cnt}</strong>
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.05rem', color: photobook.heading }}>Top blocks with C/D</h2>
                          <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.9rem', color: '#374151' }}>
                            {(gradeRisk.topBlocks || []).map((b) => (
                              <li key={`${b.block_name}-${b.estate_name}`}>
                                {b.block_name}
                                {b.estate_name ? ` (${b.estate_name})` : ''}: <strong>{b.cnt}</strong>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </SignedIn>
    </>
  )
}
