'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import InspectionFollowUpUpdates from '@/app/components/inspection/InspectionFollowUpUpdates'
import InspectionFullPdfControls from '@/app/components/InspectionFullPdfControls'
import InspectionActionCard from '@/app/components/actions/InspectionActionCard'
import { getInspectionFullReportPdfUrl } from '@/lib/inspection-pdf-fields'
import { photobook } from '@/lib/photobook-theme'

function formatDate(dateString) {
  if (!dateString) return '—'
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function CaretakerInspectionReportPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const autoFocusFollowUp = searchParams?.get('addUpdate') === '1'
  const id =
    typeof params?.id === 'string' ? params.id : Array.isArray(params?.id) ? params.id[0] : undefined

  const [inspection, setInspection] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(true)
  const [actions, setActions] = useState([])
  const [actionsLoading, setActionsLoading] = useState(true)
  const [actionsError, setActionsError] = useState('')

  const loadInspection = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setLoadError('')
    try {
      const res = await fetch(`/api/caretaker/inspections/${encodeURIComponent(id)}`, {
        credentials: 'include',
        cache: 'no-store',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setInspection(null)
        setLoadError(data?.error || data?.details || `Could not load inspection (${res.status})`)
        return
      }
      setInspection(data)
    } catch (error) {
      setInspection(null)
      setLoadError(error?.message || 'Failed to load inspection')
    } finally {
      setLoading(false)
    }
  }, [id])

  const loadActions = useCallback(async () => {
    if (!id) {
      setActions([])
      setActionsLoading(false)
      return
    }
    setActionsLoading(true)
    setActionsError('')
    try {
      const res = await fetch(`/api/actions?inspection_id=${encodeURIComponent(id)}`, {
        credentials: 'include',
        cache: 'no-store',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setActions([])
        setActionsError(data?.error || data?.details || `Could not load actions (${res.status})`)
        return
      }
      const rows = Array.isArray(data) ? data : Array.isArray(data?.rows) ? data.rows : []
      setActions(rows)
    } catch (error) {
      setActions([])
      setActionsError(error?.message || 'Failed to load actions')
    } finally {
      setActionsLoading(false)
    }
  }, [id])

  useEffect(() => {
    loadInspection()
  }, [loadInspection])

  useEffect(() => {
    loadActions()
  }, [loadActions])

  if (!id) {
    return (
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <p>Inspection not found.</p>
        <Link href="/caretaker/my-inspections" style={{ color: photobook.link }}>
          ← My inspections
        </Link>
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '0.5rem 0' }}>
        <p style={{ color: '#6b7280' }}>Loading your inspection…</p>
      </div>
    )
  }

  if (!inspection) {
    return (
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <p style={{ color: '#b45309', marginBottom: '0.75rem' }}>{loadError || 'Inspection not found'}</p>
        <Link href="/caretaker/my-inspections" style={{ color: photobook.link, textDecoration: 'none' }}>
          ← My inspections
        </Link>
      </div>
    )
  }

  const locationLine =
    inspection.location_line ||
    [inspection.estate_name, inspection.block_name, inspection.location_label].filter(Boolean).join(' · ') ||
    'Location not recorded'

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      <Link
        href="/caretaker/my-inspections"
        style={{
          display: 'inline-block',
          marginBottom: '1rem',
          color: photobook.link,
          textDecoration: 'none',
          fontSize: '0.875rem',
          fontWeight: 500,
        }}
      >
        ← My inspections
      </Link>

      <h1 style={{ margin: '0 0 0.35rem', fontSize: '1.5rem', fontWeight: 700, color: '#111827', lineHeight: 1.25 }}>
        {inspection.template_name || 'Caretaker inspection'}
      </h1>
      <p style={{ margin: '0 0 1.25rem', color: '#475569', fontSize: '0.9375rem', lineHeight: 1.45 }}>
        {locationLine}
      </p>

      <div
        style={{
          marginBottom: '1rem',
          padding: '0.85rem 1rem',
          backgroundColor: '#eff6ff',
          border: '1px solid #93c5fd',
          borderRadius: '0.5rem',
          fontSize: '0.875rem',
          color: '#1e3a8a',
          lineHeight: 1.5,
        }}
      >
        This inspection is locked as an evidential record. Answers, photos, grades, and submission time cannot be
        changed. Add follow-up notes below if repairs or work progress need recording.
      </div>

      <div
        style={{
          backgroundColor: '#fff',
          padding: '1rem',
          borderRadius: '0.5rem',
          border: '1px solid #e5e7eb',
          marginBottom: '1rem',
          boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
        }}
      >
        <h2 style={{ margin: '0 0 0.85rem', fontSize: '1.0625rem', fontWeight: 600 }}>Summary</h2>
        <dl style={{ margin: 0, display: 'grid', gap: '0.65rem' }}>
          {inspection.scope_label ? (
            <div>
              <dt style={{ margin: 0, fontSize: '0.75rem', color: '#6b7280' }}>Scope</dt>
              <dd style={{ margin: '0.15rem 0 0', fontSize: '0.9375rem', color: '#111827' }}>{inspection.scope_label}</dd>
            </div>
          ) : null}
          <div>
            <dt style={{ margin: 0, fontSize: '0.75rem', color: '#6b7280' }}>Submitted</dt>
            <dd style={{ margin: '0.15rem 0 0', fontSize: '0.9375rem', color: '#111827' }}>
              {formatDate(inspection.submitted_at)}
            </dd>
          </div>
          <div>
            <dt style={{ margin: 0, fontSize: '0.75rem', color: '#6b7280' }}>Submitted by</dt>
            <dd style={{ margin: '0.15rem 0 0', fontSize: '0.9375rem', color: '#111827' }}>
              {inspection.inspector_name || '—'}
            </dd>
          </div>
          {inspection.grading ? (
            <div>
              <dt style={{ margin: 0, fontSize: '0.75rem', color: '#6b7280' }}>Grading</dt>
              <dd style={{ margin: '0.15rem 0 0', fontSize: '0.9375rem', color: '#111827' }}>{inspection.grading}</dd>
            </div>
          ) : null}
        </dl>
      </div>

      <InspectionFollowUpUpdates
        inspectionId={id}
        isSubmitted
        canAdd
        autoFocusForm={autoFocusFollowUp}
      />

      <div
        style={{
          backgroundColor: '#fff',
          padding: '1rem',
          borderRadius: '0.5rem',
          border: '1px solid #e5e7eb',
          marginBottom: '1rem',
          boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
        }}
      >
        <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.0625rem', fontWeight: 600 }}>Actions</h2>
        {actionsLoading ? (
          <p style={{ color: '#6b7280', fontSize: '0.875rem', margin: 0 }}>Loading actions…</p>
        ) : actionsError ? (
          <p style={{ color: '#b45309', fontSize: '0.875rem', margin: 0 }}>{actionsError}</p>
        ) : actions.length === 0 ? (
          <p style={{ color: '#6b7280', fontSize: '0.875rem', margin: 0 }}>No actions were logged for this inspection.</p>
        ) : (
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {actions.map((action) => (
              <InspectionActionCard key={action.id} action={action} canEdit={false} />
            ))}
          </div>
        )}
      </div>

      <div
        style={{
          backgroundColor: '#fff',
          padding: '1rem',
          borderRadius: '0.5rem',
          border: '1px solid #e5e7eb',
          boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
        }}
      >
        <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.0625rem', fontWeight: 600 }}>PDF report</h2>
        <InspectionFullPdfControls
          inspectionId={inspection.id}
          inspection={inspection}
          pdfGenerationError={inspection.pdf_generation_error}
          onAfterGenerate={loadInspection}
        />
        {inspection.pdf_generation_error && !getInspectionFullReportPdfUrl(inspection) ? (
          <p style={{ color: '#b45309', fontSize: '0.875rem', marginTop: 8 }}>
            Last PDF error: {String(inspection.pdf_generation_error)}
          </p>
        ) : null}
      </div>
    </div>
  )
}
