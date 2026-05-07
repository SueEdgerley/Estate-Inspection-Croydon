'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { SignedIn, SignedOut, SignInButton, useAuth } from '@clerk/nextjs'
import { photobook } from '../../lib/photobook-theme'
import { inspectionTypeLabel } from '@/lib/inspection-work-types'

function countBy(rows, getLabel) {
  const counts = new Map()
  rows.forEach((row) => {
    const label = String(getLabel(row) || 'Not recorded').trim() || 'Not recorded'
    counts.set(label, (counts.get(label) || 0) + 1)
  })
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
}

function topLine(rows) {
  return rows[0] ? `${rows[0].label}: ${rows[0].count}` : 'No completed inspections yet'
}

export default function DashboardHome() {
  const { isSignedIn } = useAuth()
  const [stats, setStats] = useState({ totalCompleted: 0 })
  const [inspections, setInspections] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [authCode, setAuthCode] = useState(null)
  const [emptyStateMessage, setEmptyStateMessage] = useState(null)

  useEffect(() => {
    if (isSignedIn) loadDashboardData()
  }, [isSignedIn])

  async function loadDashboardData() {
    setLoading(true)
    setError(null)
    setAuthCode(null)
    setEmptyStateMessage(null)

    try {
      const res = await fetch('/api/dashboard', {
        credentials: 'include',
        cache: 'no-store',
      })
      const data = await res.json()

      if (res.status === 401) {
        setAuthCode('UNAUTHORIZED')
        setStats({ totalCompleted: 0 })
        setInspections([])
        return
      }

      if (res.status === 403 && data?.code) {
        setAuthCode(data.code)
        setStats({ totalCompleted: 0 })
        setInspections([])
        return
      }

      if (!res.ok) {
        if (res.status === 500 && data?.code === 'DB_NOT_MIGRATED') {
          if (process.env.NODE_ENV === 'development') {
            console.warn('[dashboard] DB_NOT_MIGRATED', data?.message || data?.error)
          }
          setError('This service is temporarily unavailable. Please try again later or contact support.')
          setStats({ totalCompleted: 0 })
          setInspections([])
          return
        }
        throw new Error(data?.details || data?.error || `Request failed: ${res.status}`)
      }

      if (data?.message) setEmptyStateMessage(data.message)
      setStats({ totalCompleted: data?.stats?.totalCompleted ?? 0 })
      setInspections(Array.isArray(data?.inspections) ? data.inspections : [])
    } catch (e) {
      setError(e?.message || 'Failed to load dashboard data')
      setStats({ totalCompleted: 0 })
      setInspections([])
    } finally {
      setLoading(false)
    }
  }

  const completedInspections = useMemo(
    () => inspections.filter((inspection) => inspection.submitted_at || String(inspection.status || '').toLowerCase() === 'submitted'),
    [inspections]
  )

  const completedByUser = useMemo(
    () => countBy(completedInspections, (inspection) => inspection.inspector_name || inspection.inspector_id),
    [completedInspections]
  )

  const completedByFormType = useMemo(
    () => countBy(completedInspections, (inspection) => inspectionTypeLabel(inspection.template_name || inspection.work_type || inspection.type)),
    [completedInspections]
  )

  const completedByEstateBlock = useMemo(
    () => countBy(completedInspections, (inspection) =>
      [inspection.estate_name, inspection.block_name].filter(Boolean).join(' / ') || inspection.location_label
    ),
    [completedInspections]
  )

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
          <p style={{ margin: '0 0 1.5rem 0', fontSize: '0.9375rem', color: photobook.primaryMuted, lineHeight: 1.5, borderLeft: `4px solid ${photobook.primary}`, paddingLeft: '1rem' }}>
            Home gives a simple overview of completed estate inspections across Croydon Council. Start new inspections from Forms, then use Manage Inspections for searching, filtering, reports, PDF downloads, and CSV exports.
          </p>

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
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
                <SummaryCard title="Total Inspections Completed" value={loading ? '...' : completedInspections.length || stats.totalCompleted} detail="Submitted inspections" />
                <SummaryCard title="Inspections by User" value={loading ? '...' : completedByUser.length} detail={topLine(completedByUser)} />
                <SummaryCard title="Inspections by Form Type" value={loading ? '...' : completedByFormType.length} detail={topLine(completedByFormType)} />
                <SummaryCard title="Inspections by Estate/Block" value={loading ? '...' : completedByEstateBlock.length} detail={topLine(completedByEstateBlock)} />
              </div>

              <div style={{ backgroundColor: '#fff', border: `1px solid ${photobook.softBorder}`, borderRadius: '0.75rem', padding: '1rem 1.25rem', color: photobook.primaryMuted, lineHeight: 1.5 }}>
                Use <strong>Forms</strong> to start an inspection. Use <strong>Manage Inspections</strong> as the operational workspace for inspection lists, filters, reports, downloads, and exports.
              </div>
            </>
          )}
        </div>
      </SignedIn>
    </>
  )
}

function SummaryCard({ title, value, detail }) {
  return (
    <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '0.5rem', boxShadow: '0 1px 3px rgba(88, 28, 135, 0.08)', border: `1px solid ${photobook.softBorder}`, borderTop: `3px solid ${photobook.primary}` }}>
      <div style={{ fontSize: '0.875rem', color: photobook.primaryMuted, marginBottom: '0.5rem', fontWeight: 600 }}>{title}</div>
      <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: photobook.heading }}>{value}</div>
      <div style={{ fontSize: '0.875rem', color: photobook.primaryMuted }}>{detail}</div>
    </div>
  )
}
