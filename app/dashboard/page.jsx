'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { SignedIn, SignedOut, SignInButton, useAuth } from '@clerk/nextjs'

export default function DashboardHome() {
  const { isSignedIn } = useAuth()
  const [stats, setStats] = useState({
    totalCompleted: 0,
    scheduledCompleted: 0,
    adHocCompleted: 0
  })
  const [inspections, setInspections] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [authCode, setAuthCode] = useState(null)
  const [emptyStateMessage, setEmptyStateMessage] = useState(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [filters, setFilters] = useState({
    dateFrom: '',
    dateTo: '',
    type: 'all',
    template: 'all',
    inspector: 'all',
    scheduled: 'all',
    grading: 'all'
  })

  useEffect(() => {
    if (isSignedIn) loadDashboardData()
  }, [isSignedIn, filters])

  async function loadDashboardData() {
    setLoading(true)
    setError(null)
    setAuthCode(null)
    setEmptyStateMessage(null)

    try {
      const params = new URLSearchParams()

      if (filters.dateFrom) params.set('dateFrom', filters.dateFrom)
      if (filters.dateTo) params.set('dateTo', filters.dateTo)
      if (filters.type && filters.type !== 'all') params.set('type', filters.type)
      if (filters.template && filters.template !== 'all') params.set('template', filters.template)
      if (filters.inspector && filters.inspector !== 'all') params.set('inspector', filters.inspector)
      if (filters.scheduled && filters.scheduled !== 'all') params.set('scheduled', filters.scheduled)
      if (filters.grading && filters.grading !== 'all') params.set('grading', filters.grading)

      const res = await fetch(`/api/dashboard?${params.toString()}`, {
        credentials: 'include',
        cache: 'no-store'
      })

      const data = await res.json()

      if (res.status === 401) {
        setAuthCode('UNAUTHORIZED')
        setStats({ totalCompleted: 0, scheduledCompleted: 0, adHocCompleted: 0 })
        setInspections([])
        return
      }

      if (res.status === 403 && data?.code) {
        setAuthCode(data.code)
        setStats({ totalCompleted: 0, scheduledCompleted: 0, adHocCompleted: 0 })
        setInspections([])
        return
      }

      if (!res.ok) {
        throw new Error(data?.details || data?.error || `Request failed: ${res.status}`)
      }

      if (data?.message) {
        setEmptyStateMessage(data.message)
      }

      setStats({
        totalCompleted: data?.stats?.totalCompleted ?? 0,
        scheduledCompleted: data?.stats?.scheduledCompleted ?? 0,
        adHocCompleted: data?.stats?.adHocCompleted ?? 0
      })

      setInspections(Array.isArray(data?.inspections) ? data.inspections : [])
    } catch (e) {
      setError(e?.message || 'Failed to load dashboard data')
      setStats({ totalCompleted: 0, scheduledCompleted: 0, adHocCompleted: 0 })
      setInspections([])
    } finally {
      setLoading(false)
    }
  }

  const handleDownload = async () => {
    try {
      const params = new URLSearchParams()
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== 'all' && value !== '') {
          params.append(key, value)
        }
      })

      const response = await fetch(`/api/dashboard/download?${params.toString()}`, { credentials: 'include' })
      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `inspections-${new Date().toISOString().split('T')[0]}.csv`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
      }
    } catch (error) {
      console.error('Error downloading CSV:', error)
      alert('Failed to download CSV')
    }
  }

  const formatDate = (dateString) => {
    if (!dateString) return '-'
    const date = new Date(dateString)
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  }

  return (
    <>
      <SignedOut>
        <div style={{
          minHeight: '60vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
        }}>
          <div style={{
            textAlign: 'center',
            maxWidth: '28rem',
          }}>
            <div style={{
              fontSize: '1.125rem',
              color: '#6b7280',
              marginBottom: '1.5rem',
              lineHeight: 1.6,
            }}>
              Please sign in to view the dashboard.
            </div>
            <SignInButton mode="modal" forceRedirectUrl="/dashboard">
              <button
                type="button"
                style={{
                  padding: '0.75rem 1.5rem',
                  fontSize: '1rem',
                  fontWeight: 600,
                  color: '#fff',
                  backgroundColor: '#0f766e',
                  border: 'none',
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                }}
              >
                Sign in
              </button>
            </SignInButton>
          </div>
        </div>
      </SignedOut>

      <SignedIn>
    <div>
      <p style={{
        margin: '0 0 1.5rem 0',
        fontSize: '0.9375rem',
        color: '#6b7280'
      }}>
        Real-time data from estate inspections across Croydon Council
      </p>

      {loading && (
        <div style={{ padding: '1rem', backgroundColor: '#f3f4f6', borderRadius: '0.5rem', marginBottom: '1rem' }}>
          Loading dashboard data...
        </div>
      )}

      {!loading && authCode && (
        <div style={{
          maxWidth: '32rem',
          margin: '0 auto 2rem',
          padding: '1.5rem',
          backgroundColor: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: '0.5rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        }}>
          <p style={{ margin: 0, fontSize: '1.0625rem', color: '#374151', lineHeight: 1.6 }}>
            {authCode === 'UNAUTHORIZED' && 'Please sign in again to view the dashboard.'}
            {authCode === 'USER_NOT_PROVISIONED' && 'Your account isn\'t set up yet. Ask an admin to assign your role/estates.'}
            {authCode === 'USER_INACTIVE' && 'Your account is inactive. Contact an admin if you need access.'}
            {authCode === 'ROLE_NOT_PERMITTED' && 'You don\'t have access to the dashboard.'}
          </p>
        </div>
      )}

      {!loading && emptyStateMessage && !authCode && (
        <div style={{
          marginBottom: '1.5rem',
          padding: '1rem 1.25rem',
          backgroundColor: '#FEF3C7',
          border: '1px solid #F59E0B',
          borderRadius: '0.5rem',
          color: '#92400E',
          fontSize: '0.9375rem',
        }}>
          {emptyStateMessage}
        </div>
      )}

      {error && !loading && (
        <div style={{
          padding: '1rem 1.25rem',
          backgroundColor: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '0.5rem',
          marginBottom: '1rem',
          color: '#991b1b',
          fontSize: '0.9375rem'
        }}>
          {error}
        </div>
      )}

      {!authCode && (
      <>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '1.5rem',
        marginBottom: '2rem'
      }}>
        <div style={{
          backgroundColor: 'white',
          padding: '1.5rem',
          borderRadius: '0.5rem',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          border: '1px solid #e5e7eb'
        }}>
          <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>
            Total Inspections Completed
          </div>
          <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#111827' }}>
            {loading ? '...' : stats.totalCompleted}
          </div>
        </div>

        <div style={{
          backgroundColor: 'white',
          padding: '1.5rem',
          borderRadius: '0.5rem',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          border: '1px solid #e5e7eb'
        }}>
          <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>
            Scheduled Inspections Completed
          </div>
          <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#111827' }}>
            {loading ? '...' : stats.scheduledCompleted}
          </div>
        </div>

        <div style={{
          backgroundColor: 'white',
          padding: '1.5rem',
          borderRadius: '0.5rem',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          border: '1px solid #e5e7eb'
        }}>
          <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>
            Ad Hoc Inspections Completed
          </div>
          <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#111827' }}>
            {loading ? '...' : stats.adHocCompleted}
          </div>
        </div>
      </div>

      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1.5rem'
      }}>
        <Link
          href="/inspections/new"
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '0.5rem',
            fontSize: '0.9375rem',
            fontWeight: '500',
            cursor: 'pointer',
            textDecoration: 'none',
            display: 'inline-block'
          }}
        >
          Start New Inspection
        </Link>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button
            onClick={() => setFiltersOpen(!filtersOpen)}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: 'white',
              color: '#374151',
              border: '1px solid #d1d5db',
              borderRadius: '0.5rem',
              fontSize: '0.9375rem',
              fontWeight: '500',
              cursor: 'pointer'
            }}
          >
            Show Filters
          </button>
          <button
            onClick={handleDownload}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              fontSize: '0.9375rem',
              fontWeight: '500',
              cursor: 'pointer'
            }}
          >
            Download
          </button>
        </div>
      </div>

      {filtersOpen && (
        <div style={{
          backgroundColor: 'white',
          padding: '1.5rem',
          borderRadius: '0.5rem',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
          marginBottom: '1.5rem',
          border: '1px solid #e5e7eb'
        }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem',
            marginBottom: '1rem'
          }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.5rem', color: '#374151' }}>
                Date From
              </label>
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem'
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.5rem', color: '#374151' }}>
                Date To
              </label>
              <input
                type="date"
                value={filters.dateTo}
                onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem'
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.5rem', color: '#374151' }}>
                Type
              </label>
              <select
                value={filters.type}
                onChange={(e) => setFilters({ ...filters, type: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem'
                }}
              >
                <option value="all">All Types</option>
                <option value="street">Street</option>
                <option value="block">Block</option>
                <option value="estate">Estate</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.5rem', color: '#374151' }}>
                Scheduled
              </label>
              <select
                value={filters.scheduled}
                onChange={(e) => setFilters({ ...filters, scheduled: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem'
                }}
              >
                <option value="all">All</option>
                <option value="scheduled">Scheduled</option>
                <option value="ad_hoc">Ad Hoc</option>
              </select>
            </div>
          </div>
          <button
            onClick={() => {
              setFilters({
                dateFrom: '',
                dateTo: '',
                type: 'all',
                template: 'all',
                inspector: 'all',
                scheduled: 'all',
                grading: 'all'
              })
            }}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#f3f4f6',
              color: '#374151',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '0.875rem',
              cursor: 'pointer'
            }}
          >
            Clear Filters
          </button>
        </div>
      )}

      <div style={{
        backgroundColor: 'white',
        borderRadius: '0.5rem',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        overflow: 'hidden',
        border: '1px solid #e5e7eb'
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: '600', color: '#374151' }}>Type</th>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: '600', color: '#374151' }}>Location</th>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: '600', color: '#374151' }}>User</th>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: '600', color: '#374151' }}>Template</th>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: '600', color: '#374151' }}>Due Date</th>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: '600', color: '#374151' }}>Completed</th>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: '600', color: '#374151' }}>Grading</th>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'center', fontSize: '0.875rem', fontWeight: '600', color: '#374151' }}>View</th>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'center', fontSize: '0.875rem', fontWeight: '600', color: '#374151' }}>Select</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
                  Loading inspections...
                </td>
              </tr>
            ) : inspections.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
                  No inspections found
                </td>
              </tr>
            ) : (
              inspections.map((inspection) => (
                <tr
                  key={inspection.id}
                  style={{
                    borderBottom: '1px solid #e5e7eb',
                    transition: 'background-color 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem', color: '#111827' }}>
                    {inspection.type || '-'}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem', color: '#111827' }}>
                    {inspection.location_label || '-'}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem', color: '#111827' }}>
                    {inspection.inspector_name || '-'}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem', color: '#111827' }}>
                    {inspection.template_name || '-'}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem', color: '#111827' }}>
                    {formatDate(inspection.due_date)}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem', color: '#111827' }}>
                    {formatDate(inspection.submitted_at)}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem', color: '#111827' }}>
                    {inspection.grading || '-'}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                    {inspection.pdf_url ? (
                      <a
                        href={inspection.pdf_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          color: '#3b82f6',
                          textDecoration: 'none',
                          fontSize: '1.25rem'
                        }}
                      >
                        👁️
                      </a>
                    ) : (
                      <span style={{ color: '#9ca3af' }}>-</span>
                    )}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                    <Link
                      href={`/inspections/${inspection.id}`}
                      style={{
                        color: '#3b82f6',
                        textDecoration: 'none',
                        fontSize: '1.25rem'
                      }}
                    >
                      ✓
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      </>
      )}
    </div>
      </SignedIn>
    </>
  )
}
