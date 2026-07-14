'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { SignedIn, SignedOut, SignInButton, useAuth } from '@clerk/nextjs'
import { photobook } from '../../lib/photobook-theme'
import { HOME_PERIOD_PRESETS } from '@/lib/analytics-date-presets'

const EMPTY_OVERVIEW = {
  applied: { preset: 'month', label: 'This month', dateFrom: '', dateTo: '', rangeLabel: 'This month' },
  kpis: {
    inspectionsCompleted: 0,
    openActions: 0,
    overdueActions: 0,
    blocksInspected: 0,
    estatesInspected: 0,
  },
  byWorkType: [],
  topInspectors: [],
  latestInspections: [],
  latestOpenActions: [],
  links: { analytics: '/analytics', inspections: '/inspections', actions: '/actions' },
}

function formatShortDate(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatPriority(value) {
  const raw = String(value || '').trim()
  if (!raw) return '—'
  return raw.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatStatus(value) {
  const raw = String(value || 'open').trim()
  return raw.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export default function DashboardHome() {
  const { isSignedIn } = useAuth()
  const [preset, setPreset] = useState('month')
  const [overview, setOverview] = useState(EMPTY_OVERVIEW)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [authCode, setAuthCode] = useState(null)
  const [emptyStateMessage, setEmptyStateMessage] = useState(null)

  const loadOverview = useCallback(async (selectedPreset) => {
    setLoading(true)
    setError(null)
    setAuthCode(null)
    setEmptyStateMessage(null)

    try {
      const qs = new URLSearchParams({ preset: selectedPreset || 'month' })
      const res = await fetch(`/api/home-overview?${qs.toString()}`, {
        credentials: 'include',
        cache: 'no-store',
      })
      const data = await res.json()

      if (res.status === 401) {
        setAuthCode('UNAUTHORIZED')
        setOverview(EMPTY_OVERVIEW)
        return
      }

      if (res.status === 403 && data?.code) {
        setAuthCode(data.code)
        setOverview(EMPTY_OVERVIEW)
        return
      }

      if (!res.ok) {
        if (res.status === 500 && data?.code === 'DB_NOT_MIGRATED') {
          if (process.env.NODE_ENV === 'development') {
            console.warn('[dashboard] DB_NOT_MIGRATED', data?.message || data?.error)
          }
          setError('This service is temporarily unavailable. Please try again later or contact support.')
          setOverview(EMPTY_OVERVIEW)
          return
        }
        throw new Error(data?.details || data?.error || `Request failed: ${res.status}`)
      }

      if (data?.message) setEmptyStateMessage(data.message)
      setOverview({
        applied: data.applied || EMPTY_OVERVIEW.applied,
        kpis: { ...EMPTY_OVERVIEW.kpis, ...(data.kpis || {}) },
        byWorkType: Array.isArray(data.byWorkType) ? data.byWorkType : [],
        topInspectors: Array.isArray(data.topInspectors) ? data.topInspectors : [],
        latestInspections: Array.isArray(data.latestInspections) ? data.latestInspections : [],
        latestOpenActions: Array.isArray(data.latestOpenActions) ? data.latestOpenActions : [],
        links: { ...EMPTY_OVERVIEW.links, ...(data.links || {}) },
      })
    } catch (e) {
      setError(e?.message || 'Failed to load dashboard data')
      setOverview(EMPTY_OVERVIEW)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isSignedIn) loadOverview(preset)
  }, [isSignedIn, preset, loadOverview])

  const kpis = overview.kpis
  const links = overview.links
  const periodLabel = overview.applied?.rangeLabel || overview.applied?.label || 'This month'

  return (
    <>
      <SignedOut>
        <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
          <div style={{ textAlign: 'center', maxWidth: '28rem' }}>
            <div style={{ fontSize: '1.125rem', color: '#6b7280', marginBottom: '1.5rem', lineHeight: 1.6 }}>
              Please sign in to view the dashboard.
            </div>
            <SignInButton mode="modal" forceRedirectUrl="/dashboard">
              <button type="button" style={{ padding: '0.75rem 1.5rem', fontSize: '1rem', fontWeight: 600, color: '#fff', backgroundColor: photobook.primary, border: 'none', borderRadius: '0.5rem', cursor: 'pointer', boxShadow: '0 2px 8px rgba(192, 38, 211, 0.35)' }}>
                Sign in
              </button>
            </SignInButton>
          </div>
        </div>
      </SignedOut>

      <SignedIn>
        <div>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.25rem' }}>
            <p style={{ margin: 0, flex: '1 1 18rem', fontSize: '0.9375rem', color: photobook.primaryMuted, lineHeight: 1.5, borderLeft: `4px solid ${photobook.primary}`, paddingLeft: '1rem' }}>
              Operational overview of completed inspections and open issues across Croydon estates. Use Forms to start work, Manage Inspections for lists and exports, and Issues / Actions for the live backlog.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
              <label htmlFor="home-period" style={{ fontSize: '0.8125rem', fontWeight: 600, color: photobook.heading }}>
                Period
              </label>
              <select
                id="home-period"
                value={preset}
                onChange={(e) => setPreset(e.target.value)}
                disabled={loading || Boolean(authCode)}
                style={{
                  minWidth: '11rem',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '0.5rem',
                  border: `1px solid ${photobook.softBorder}`,
                  backgroundColor: '#fff',
                  color: photobook.heading,
                  fontWeight: 600,
                  fontSize: '0.875rem',
                }}
              >
                {HOME_PERIOD_PRESETS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
          </div>

          {!authCode && (
            <div style={{ marginBottom: '1.5rem', padding: '0.75rem 1rem', backgroundColor: photobook.soft, border: `1px solid ${photobook.softBorder}`, borderRadius: '0.5rem', fontSize: '0.875rem', color: photobook.primaryMuted }}>
              Showing data for <strong style={{ color: photobook.heading }}>{periodLabel}</strong>
              {' · '}Inspection metrics use this period; open and overdue actions are the live backlog.
            </div>
          )}

          {loading && (
            <div style={{ padding: '1rem', backgroundColor: '#f3f4f6', borderRadius: '0.5rem', marginBottom: '1rem' }}>
              Loading dashboard data...
            </div>
          )}

          {!loading && authCode && (
            <div style={{ maxWidth: '32rem', margin: '0 auto 2rem', padding: '1.5rem', backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '0.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
              <p style={{ margin: 0, fontSize: '1.0625rem', color: '#374151', lineHeight: 1.6 }}>
                {authCode === 'UNAUTHORIZED' && 'Please sign in again to view the dashboard.'}
                {authCode === 'USER_NOT_PROVISIONED' && 'Your account is not set up yet. Ask an admin to assign your role/estates.'}
                {authCode === 'USER_INACTIVE' && 'Your account is inactive. Contact an admin if you need access.'}
                {authCode === 'ROLE_NOT_PERMITTED' && 'You do not have access to the dashboard. You can still use templates.'}
              </p>
              {(authCode === 'ROLE_NOT_PERMITTED' || authCode === 'USER_NOT_PROVISIONED') && (
                <p style={{ margin: '1rem 0 0', fontSize: '0.9375rem' }}>
                  <Link href="/templates" style={{ color: photobook.link, fontWeight: 600 }}>Go to Forms</Link>
                </p>
              )}
            </div>
          )}

          {!loading && emptyStateMessage && !authCode && (
            <div style={{ marginBottom: '1.5rem', padding: '1rem 1.25rem', backgroundColor: '#FEF3C7', border: '1px solid #F59E0B', borderRadius: '0.5rem', color: '#92400E', fontSize: '0.9375rem' }}>
              {emptyStateMessage}
            </div>
          )}

          {error && !loading && (
            <div style={{ padding: '1rem 1.25rem', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.5rem', marginBottom: '1rem', color: '#991b1b', fontSize: '0.9375rem' }}>
              {error}
              <p style={{ margin: '0.75rem 0 0', fontSize: '0.875rem' }}>
                <Link href="/templates" style={{ color: photobook.link, fontWeight: 600 }}>Go to Forms</Link>
              </p>
            </div>
          )}

          {!authCode && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem', marginBottom: '1.75rem' }}>
                <SummaryCard
                  title="Inspections completed"
                  value={loading ? '...' : kpis.inspectionsCompleted}
                  detail={periodLabel}
                  href={links.inspections}
                  linkLabel="Manage Inspections"
                />
                <SummaryCard
                  title="Open issues / actions"
                  value={loading ? '...' : kpis.openActions}
                  detail="Open now (live backlog)"
                  href={links.actions}
                  linkLabel="View actions"
                />
                <SummaryCard
                  title="Overdue issues / actions"
                  value={loading ? '...' : kpis.overdueActions}
                  detail="Open now, past target date"
                  href={links.actions}
                  linkLabel="View actions"
                  accent="#b45309"
                />
                <SummaryCard
                  title="Blocks inspected"
                  value={loading ? '...' : kpis.blocksInspected}
                  detail={
                    loading
                      ? '…'
                      : `${kpis.estatesInspected} estate${kpis.estatesInspected === 1 ? '' : 's'} in period`
                  }
                  href={links.inspections}
                  linkLabel="Manage Inspections"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem', marginBottom: '1.75rem' }}>
                <Panel
                  title="Inspections by form type"
                  subtitle={periodLabel}
                  footer={<Link href={links.analytics} style={linkStyle}>Open Analytics</Link>}
                >
                  {loading ? (
                    <Muted>Loading…</Muted>
                  ) : overview.byWorkType.length === 0 || overview.byWorkType.every((row) => row.count === 0) ? (
                    <Muted>No completed inspections in this period.</Muted>
                  ) : (
                    <ul style={listReset}>
                      {overview.byWorkType.filter((row) => row.count > 0).map((row) => (
                        <li key={row.workType || row.label} style={rowStyle}>
                          <span>{row.label}</span>
                          <strong style={{ color: photobook.heading }}>{row.count}</strong>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>

                <Panel
                  title="Top inspectors"
                  subtitle={`Top 5 · ${periodLabel}`}
                  footer={<Link href={links.inspections} style={linkStyle}>Manage Inspections</Link>}
                >
                  {loading ? (
                    <Muted>Loading…</Muted>
                  ) : overview.topInspectors.length === 0 ? (
                    <Muted>No completed inspections in this period.</Muted>
                  ) : (
                    <ul style={listReset}>
                      {overview.topInspectors.map((row) => (
                        <li key={`${row.personId}-${row.personLabel}`} style={rowStyle}>
                          <span>
                            {row.personLabel}
                            {row.roleLabel ? (
                              <span style={{ display: 'block', fontSize: '0.75rem', color: photobook.primaryMuted }}>{row.roleLabel}</span>
                            ) : null}
                          </span>
                          <strong style={{ color: photobook.heading }}>{row.completedCount}</strong>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.25rem', marginBottom: '1.75rem' }}>
                <Panel
                  title="Latest completed inspections"
                  subtitle={periodLabel}
                  footer={<Link href={links.inspections} style={linkStyle}>All inspections</Link>}
                >
                  {loading ? (
                    <Muted>Loading…</Muted>
                  ) : overview.latestInspections.length === 0 ? (
                    <Muted>No completed inspections in this period.</Muted>
                  ) : (
                    <ul style={listReset}>
                      {overview.latestInspections.map((row) => (
                        <li key={row.id} style={{ ...rowStyle, alignItems: 'flex-start', flexDirection: 'column', gap: '0.25rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', gap: '0.75rem' }}>
                            <Link href={`/inspections/${row.id}`} style={{ ...linkStyle, fontWeight: 600 }}>
                              {row.locationLabel}
                            </Link>
                            <span style={{ fontSize: '0.8125rem', color: photobook.primaryMuted, whiteSpace: 'nowrap' }}>
                              {formatShortDate(row.submittedAt)}
                            </span>
                          </div>
                          <div style={{ fontSize: '0.8125rem', color: photobook.primaryMuted }}>
                            {row.workTypeLabel}
                            {row.inspectorName ? ` · ${row.inspectorName}` : ''}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>

                <Panel
                  title="Latest open actions"
                  subtitle="Overdue first, then priority"
                  footer={<Link href={links.actions} style={linkStyle}>All actions</Link>}
                >
                  {loading ? (
                    <Muted>Loading…</Muted>
                  ) : overview.latestOpenActions.length === 0 ? (
                    <Muted>No open actions right now.</Muted>
                  ) : (
                    <ul style={listReset}>
                      {overview.latestOpenActions.map((row) => (
                        <li key={row.id} style={{ ...rowStyle, alignItems: 'flex-start', flexDirection: 'column', gap: '0.25rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', gap: '0.75rem' }}>
                            <Link href={links.actions} style={{ ...linkStyle, fontWeight: 600 }}>
                              {row.title}
                            </Link>
                            {row.isOverdue ? (
                              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#b45309', whiteSpace: 'nowrap' }}>Overdue</span>
                            ) : null}
                          </div>
                          <div style={{ fontSize: '0.8125rem', color: photobook.primaryMuted }}>
                            {row.locationLabel}
                            {' · '}
                            {formatStatus(row.status)}
                            {' · '}
                            {formatPriority(row.priority)}
                            {row.expectedCompletionDate ? ` · due ${formatShortDate(row.expectedCompletionDate)}` : ''}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>
              </div>

              <div style={{ backgroundColor: '#fff', border: `1px solid ${photobook.softBorder}`, borderRadius: '0.75rem', padding: '1rem 1.25rem', color: photobook.primaryMuted, lineHeight: 1.5, display: 'flex', flexWrap: 'wrap', gap: '0.75rem 1.25rem' }}>
                <Link href="/templates" style={linkStyle}>Forms</Link>
                <Link href={links.inspections} style={linkStyle}>Manage Inspections</Link>
                <Link href={links.actions} style={linkStyle}>Issues / Actions</Link>
                <Link href={links.analytics} style={linkStyle}>Analytics</Link>
              </div>
            </>
          )}
        </div>
      </SignedIn>
    </>
  )
}

function SummaryCard({ title, value, detail, href, linkLabel, accent }) {
  return (
    <div style={{ backgroundColor: 'white', padding: '1.25rem 1.35rem', borderRadius: '0.5rem', boxShadow: '0 1px 3px rgba(88, 28, 135, 0.08)', border: `1px solid ${photobook.softBorder}`, borderTop: `3px solid ${accent || photobook.primary}` }}>
      <div style={{ fontSize: '0.875rem', color: photobook.primaryMuted, marginBottom: '0.5rem', fontWeight: 600 }}>{title}</div>
      <div style={{ fontSize: '2.25rem', fontWeight: 'bold', color: photobook.heading, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: '0.8125rem', color: photobook.primaryMuted, marginTop: '0.35rem' }}>{detail}</div>
      {href && linkLabel ? (
        <div style={{ marginTop: '0.75rem' }}>
          <Link href={href} style={{ ...linkStyle, fontSize: '0.8125rem' }}>{linkLabel}</Link>
        </div>
      ) : null}
    </div>
  )
}

function Panel({ title, subtitle, children, footer }) {
  return (
    <section style={{ backgroundColor: '#fff', border: `1px solid ${photobook.softBorder}`, borderRadius: '0.75rem', padding: '1rem 1.15rem', boxShadow: '0 1px 3px rgba(88, 28, 135, 0.06)' }}>
      <div style={{ marginBottom: '0.85rem' }}>
        <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: photobook.heading }}>{title}</h2>
        {subtitle ? <div style={{ marginTop: '0.25rem', fontSize: '0.8125rem', color: photobook.primaryMuted }}>{subtitle}</div> : null}
      </div>
      {children}
      {footer ? <div style={{ marginTop: '0.85rem', paddingTop: '0.75rem', borderTop: `1px solid ${photobook.softBorder}` }}>{footer}</div> : null}
    </section>
  )
}

function Muted({ children }) {
  return <p style={{ margin: 0, fontSize: '0.875rem', color: photobook.primaryMuted }}>{children}</p>
}

const linkStyle = {
  color: photobook.link,
  fontWeight: 600,
  textDecoration: 'none',
}

const listReset = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '0.65rem',
}

const rowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '0.75rem',
  fontSize: '0.875rem',
  color: '#374151',
}
