'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { SignedIn, SignedOut, SignInButton, useAuth } from '@clerk/nextjs'
import { photobook } from '../../lib/photobook-theme'
import InspectionFullPdfControls from '@/app/components/InspectionFullPdfControls'
import { getInspectionFullReportPdfUrl, withInspectionPdfDefaults } from '@/lib/inspection-pdf-fields'

export default function DashboardHome() {
  const { isSignedIn } = useAuth()
  const [selectedInspectionIds, setSelectedInspectionIds] = useState([])
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
        if (res.status === 500 && data?.code === 'DB_NOT_MIGRATED') {
          setError(data?.message || data?.error || 'DB not migrated. Run: prisma migrate deploy')
          setStats({ totalCompleted: 0, scheduledCompleted: 0, adHocCompleted: 0 })
          setInspections([])
          setLoading(false)
          return
        }
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

      const nextInspections = Array.isArray(data?.inspections) ? data.inspections : []
      setInspections(nextInspections.map((r) => withInspectionPdfDefaults(r)))
      const nextIds = new Set(nextInspections.map((i) => i.id))
      setSelectedInspectionIds((prev) => prev.filter((id) => nextIds.has(id)))
    } catch (e) {
      setError(e?.message || 'Failed to load dashboard data')
      setStats({ totalCompleted: 0, scheduledCompleted: 0, adHocCompleted: 0 })
      setInspections([])
    } finally {
      setLoading(false)
    }
  }

  const handleDownloadPdf = async () => {
    try {
      if (selectedInspectionIds.length === 0) {
        alert('Please select at least one inspection to download')
        return
      }

      const selectedRows = inspections.filter((i) => selectedInspectionIds.includes(i.id))

      for (let index = 0; index < selectedRows.length; index++) {
        const inspection = selectedRows[index]
        let pdfUrl = getInspectionFullReportPdfUrl(inspection) || ''
        if (!pdfUrl) {
          const res = await fetch(`/api/inspections/${inspection.id}/report-pdf`, {
            method: 'POST',
            credentials: 'include',
          })
          const data = await res.json().catch(() => ({}))
          if (!res.ok) {
            window.alert(
              data.details || data.error || `Could not generate PDF for ${inspection.id} (${res.status})`
            )
            continue
          }
          pdfUrl = String(data.url || '').trim()
        }
        if (!pdfUrl) continue
        const a = document.createElement('a')
        a.href = pdfUrl
        a.target = '_blank'
        a.rel = 'noopener noreferrer'
        a.download = `inspection-${inspection.id}.pdf`
        document.body.appendChild(a)
        await new Promise((r) => setTimeout(r, index * 120))
        a.click()
        document.body.removeChild(a)
      }

      await loadDashboardData()
    } catch (error) {
      console.error('Error downloading inspection PDF(s):', error)
      alert(error?.message || 'Failed to download selected inspection PDF(s)')
    }
  }

  const handleExportCsv = () => {
    try {
      if (selectedInspectionIds.length === 0) {
        alert('Please select at least one inspection to export')
        return
      }

      const selectedRows = inspections.filter((i) => selectedInspectionIds.includes(i.id))
      const headers = ['Inspection ID', 'Type', 'Location', 'User', 'Template', 'Due Date', 'Completed', 'Grading', 'PDF URL']
      const escapeCell = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`
      const rows = selectedRows.map((i) => [
        i.id || '',
        i.type || '',
        i.location_label || '',
        i.inspector_name || '',
        i.template_name || '',
        i.due_date || '',
        i.submitted_at || '',
        i.grading || '',
        getInspectionFullReportPdfUrl(i) || '',
      ])

      const csv = [headers.map(escapeCell).join(','), ...rows.map((r) => r.map(escapeCell).join(','))].join('\n')
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `selected-inspections-${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Error exporting selected inspections CSV:', error)
      alert(error?.message || 'Failed to export selected inspections CSV')
    }
  }

  const toggleInspectionSelection = (inspectionId) => {
    setSelectedInspectionIds((prev) =>
      prev.includes(inspectionId)
        ? prev.filter((id) => id !== inspectionId)
        : [...prev, inspectionId]
    )
  }

  const visibleInspectionIds = inspections.map((i) => i.id).filter(Boolean)
  const allVisibleSelected =
    visibleInspectionIds.length > 0 &&
    visibleInspectionIds.every((id) => selectedInspectionIds.includes(id))

  const toggleSelectAllVisible = () => {
    setSelectedInspectionIds((prev) => {
      if (allVisibleSelected) {
        return prev.filter((id) => !visibleInspectionIds.includes(id))
      }
      return Array.from(new Set([...prev, ...visibleInspectionIds]))
    })
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
                  backgroundColor: photobook.primary,
                  border: 'none',
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(192, 38, 211, 0.35)',
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
        color: photobook.primaryMuted,
        lineHeight: 1.5,
        borderLeft: `4px solid ${photobook.primary}`,
        paddingLeft: '1rem',
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
            {authCode === 'ROLE_NOT_PERMITTED' && 'You don\'t have access to the dashboard. You can still use templates.'}
          </p>
          {(authCode === 'ROLE_NOT_PERMITTED' || authCode === 'USER_NOT_PROVISIONED') && (
            <p style={{ margin: '1rem 0 0', fontSize: '0.9375rem' }}>
              <Link href="/templates" style={{ color: photobook.link, fontWeight: 600 }}>Go to Templates</Link>
            </p>
          )}
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
          <p style={{ margin: '0.75rem 0 0', fontSize: '0.875rem' }}>
            <Link href="/templates" style={{ color: photobook.link, fontWeight: 600 }}>Go to Templates</Link>
          </p>
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
          boxShadow: '0 1px 3px rgba(88, 28, 135, 0.08)',
          border: `1px solid ${photobook.softBorder}`,
          borderTop: `3px solid ${photobook.primary}`,
        }}>
          <div style={{ fontSize: '0.875rem', color: photobook.primaryMuted, marginBottom: '0.5rem', fontWeight: 600 }}>
            Total Inspections Completed
          </div>
          <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: photobook.heading }}>
            {loading ? '...' : stats.totalCompleted}
          </div>
        </div>

        <div style={{
          backgroundColor: 'white',
          padding: '1.5rem',
          borderRadius: '0.5rem',
          boxShadow: '0 1px 3px rgba(88, 28, 135, 0.08)',
          border: `1px solid ${photobook.softBorder}`,
          borderTop: `3px solid ${photobook.primary}`,
        }}>
          <div style={{ fontSize: '0.875rem', color: photobook.primaryMuted, marginBottom: '0.5rem', fontWeight: 600 }}>
            Scheduled Inspections Completed
          </div>
          <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: photobook.heading }}>
            {loading ? '...' : stats.scheduledCompleted}
          </div>
        </div>

        <div style={{
          backgroundColor: 'white',
          padding: '1.5rem',
          borderRadius: '0.5rem',
          boxShadow: '0 1px 3px rgba(88, 28, 135, 0.08)',
          border: `1px solid ${photobook.softBorder}`,
          borderTop: `3px solid ${photobook.primary}`,
        }}>
          <div style={{ fontSize: '0.875rem', color: photobook.primaryMuted, marginBottom: '0.5rem', fontWeight: 600 }}>
            Ad Hoc Inspections Completed
          </div>
          <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: photobook.heading }}>
            {loading ? '...' : stats.adHocCompleted}
          </div>
        </div>
      </div>

      <div style={{
        display: 'flex',
        justifyContent: 'flex-end',
        alignItems: 'center',
        marginBottom: '1.5rem'
      }}>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button
            onClick={() => setFiltersOpen(!filtersOpen)}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: 'white',
              color: photobook.heading,
              border: `2px solid ${photobook.primary}`,
              borderRadius: '0.5rem',
              fontSize: '0.9375rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Show Filters
          </button>
          <button
            onClick={handleDownloadPdf}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: photobook.primary,
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              fontSize: '0.9375rem',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(192, 38, 211, 0.3)',
            }}
          >
            Download PDF
          </button>
          <button
            onClick={handleExportCsv}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: 'white',
              color: photobook.heading,
              border: `2px solid ${photobook.primary}`,
              borderRadius: '0.5rem',
              fontSize: '0.9375rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Export CSV
          </button>
        </div>
      </div>

      {filtersOpen && (
        <div style={{
          backgroundColor: photobook.soft,
          padding: '1.5rem',
          borderRadius: '0.5rem',
          boxShadow: '0 4px 6px rgba(88, 28, 135, 0.08)',
          marginBottom: '1.5rem',
          border: `1px solid ${photobook.softBorder}`
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
                <option value="inspection">Template (inspection)</option>
                <option value="ad_hoc">Ad hoc</option>
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
        boxShadow: '0 1px 3px rgba(88, 28, 135, 0.08)',
        overflow: 'hidden',
        border: `1px solid ${photobook.softBorder}`
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: photobook.soft, borderBottom: `1px solid ${photobook.softBorder}` }}>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: '600', color: photobook.heading }}>Type</th>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: '600', color: photobook.heading }}>Location</th>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: '600', color: photobook.heading }}>User</th>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: '600', color: photobook.heading }}>Template</th>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: '600', color: photobook.heading }}>Due Date</th>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: '600', color: photobook.heading }}>Completed</th>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: '600', color: photobook.heading }}>Grading</th>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'center', fontSize: '0.875rem', fontWeight: '600', color: photobook.heading }}>View</th>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'center', fontSize: '0.875rem', fontWeight: '600', color: photobook.heading }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleSelectAllVisible}
                    aria-label="Select all visible inspections"
                    style={{ width: 18, height: 18, accentColor: photobook.primary, cursor: 'pointer' }}
                  />
                  <span>Select</span>
                </label>
              </th>
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
                    <InspectionFullPdfControls
                      inspectionId={inspection.id}
                      inspection={inspection}
                      pdfGenerationError={inspection.pdf_generation_error}
                      onAfterGenerate={loadDashboardData}
                      variant="icons"
                      linkStyle={{ color: photobook.link }}
                    />
                  </td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={selectedInspectionIds.includes(inspection.id)}
                      onChange={() => toggleInspectionSelection(inspection.id)}
                      aria-label={`Select inspection ${inspection.id}`}
                      style={{ width: 18, height: 18, accentColor: photobook.primary, cursor: 'pointer' }}
                    />
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
