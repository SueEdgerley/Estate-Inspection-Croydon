'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { SignedIn, SignedOut, SignInButton, useAuth } from '@clerk/nextjs'
import { photobook } from '@/lib/photobook-theme'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'estates', label: 'Estates & blocks' },
  { id: 'issues', label: 'Issues & hotspots' },
  { id: 'trends', label: 'Trends' },
  { id: 'performance', label: 'Performance' },
]

function formatMonthLabel(isoDate) {
  if (!isoDate) return '—'
  const d = new Date(isoDate)
  if (Number.isNaN(d.getTime())) return String(isoDate)
  return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
}

function cardStyle(accent = photobook.primary) {
  return {
    backgroundColor: 'white',
    padding: '1.25rem',
    borderRadius: '0.5rem',
    boxShadow: '0 1px 3px rgba(88, 28, 135, 0.08)',
    border: `1px solid ${photobook.softBorder}`,
    borderTop: `3px solid ${accent}`,
  }
}

export default function AnalyticsPage() {
  const { isSignedIn } = useAuth()
  const [tab, setTab] = useState('overview')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [authCode, setAuthCode] = useState(null)
  const [message, setMessage] = useState(null)
  const [payload, setPayload] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    setAuthCode(null)
    setMessage(null)
    try {
      const res = await fetch('/api/analytics', { credentials: 'include', cache: 'no-store' })
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
  }, [])

  useEffect(() => {
    if (isSignedIn) load()
  }, [isSignedIn, load])

  const overview = payload?.overview
  const estates = payload?.estates ?? []
  const blocks = payload?.blocks ?? []
  const issues = payload?.issues
  const trends = payload?.trends
  const performance = payload?.performance

  const maxVolume = useMemo(() => {
    const v = trends?.volumeByMonth ?? []
    return Math.max(1, ...v.map((m) => Number(m.inspection_count) || 0))
  }, [trends])

  return (
    <>
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
        <div style={{ maxWidth: '56rem', margin: '0 auto', padding: '0 1rem 2.5rem' }}>
          <header style={{ marginBottom: '1.5rem' }}>
            <h1 style={{ margin: 0, fontSize: 'clamp(1.5rem, 4vw, 2rem)', fontWeight: 700, color: photobook.heading }}>
              Analytics
            </h1>
            <p style={{ margin: '0.35rem 0 0', color: '#6b7280', fontSize: '0.9375rem', lineHeight: 1.5 }}>
              Inspection insights split into sections — open one area at a time for clarity.
            </p>
          </header>

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
                  'You do not have access to Analytics (owner or admin role required).'}
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
                  <div>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                        gap: '1rem',
                        marginBottom: '1.25rem',
                      }}
                    >
                      <div style={cardStyle()}>
                        <div style={{ fontSize: '0.8rem', color: photobook.primaryMuted, fontWeight: 600, marginBottom: '0.35rem' }}>
                          Overall score (A–D avg.)
                        </div>
                        <div style={{ fontSize: '1.65rem', fontWeight: 700, color: photobook.heading, lineHeight: 1.2 }}>
                          {overview.overallScore != null ? Number(overview.overallScore).toFixed(2) : '—'}
                          <span style={{ fontSize: '0.85rem', fontWeight: 500, color: '#6b7280' }}> / 4</span>
                        </div>
                        {overview.gradedInspections != null && (
                          <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.35rem' }}>
                            {overview.gradedInspections} graded inspection{overview.gradedInspections === 1 ? '' : 's'}
                          </div>
                        )}
                      </div>
                      <div style={cardStyle()}>
                        <div style={{ fontSize: '0.8rem', color: photobook.primaryMuted, fontWeight: 600, marginBottom: '0.35rem' }}>
                          Total inspections
                        </div>
                        <div style={{ fontSize: '1.65rem', fontWeight: 700, color: photobook.heading }}>
                          {overview.totalInspections}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.35rem' }}>Submitted (in filter)</div>
                      </div>
                      <div style={cardStyle()}>
                        <div style={{ fontSize: '0.8rem', color: photobook.primaryMuted, fontWeight: 600, marginBottom: '0.35rem' }}>
                          Completion rate
                        </div>
                        <div style={{ fontSize: '1.65rem', fontWeight: 700, color: photobook.heading }}>
                          {overview.completionRatePct != null ? `${overview.completionRatePct}%` : '—'}
                        </div>
                        {overview.completionBasis && (
                          <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: '0.35rem', lineHeight: 1.35 }}>
                            {overview.completionBasis}
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={{ ...cardStyle(photobook.link), borderTop: `3px solid ${photobook.link}` }}>
                      <div style={{ fontSize: '0.8rem', color: photobook.primaryMuted, fontWeight: 600, marginBottom: '0.5rem' }}>
                        Simple trend (volume)
                      </div>
                      <p style={{ margin: 0, fontSize: '0.9375rem', color: '#374151', lineHeight: 1.55 }}>
                        {overview.trend?.label}
                      </p>
                      <div style={{ display: 'flex', gap: '1.25rem', marginTop: '0.75rem', flexWrap: 'wrap', fontSize: '0.8125rem', color: '#6b7280' }}>
                        <span>Last 90 days: {overview.trend?.recent90d ?? 0}</span>
                        <span>Previous 90 days: {overview.trend?.prior90d ?? 0}</span>
                      </div>
                    </div>
                  </div>
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
                      Submitted vs total inspections per inspector (same filters as elsewhere). Useful for spotting workload and follow-through.
                    </p>
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
              </section>
            </>
          )}
        </div>
      </SignedIn>
    </>
  )
}
