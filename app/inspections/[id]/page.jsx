'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { GeneratePosterButton } from '@/app/components/GeneratePosterButton'
import GenerateRepairsUpdatePdfButton from '@/app/components/GenerateRepairsUpdatePdfButton'
import InspectionFullPdfControls from '@/app/components/InspectionFullPdfControls'
import { getInspectionFullReportPdfUrl } from '@/lib/inspection-pdf-fields'

export default function InspectionDetail() {
  const params = useParams()
  // Match wizard: dynamic [id] can be string | string[]; never await useParams() (sync hook).
  const id =
    typeof params?.id === 'string' ? params.id : Array.isArray(params?.id) ? params.id[0] : undefined
  const [inspection, setInspection] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [actions, setActions] = useState([])
  const [actionsLoading, setActionsLoading] = useState(true)
  const [actionsError, setActionsError] = useState(null)

  useEffect(() => {
    if (!id) {
      setLoading(false)
      setInspection(null)
      setLoadError(null)
      return
    }

    let cancelled = false
    const loadInspection = async () => {
      setLoading(true)
      setLoadError(null)
      try {
        const response = await fetch(`/api/inspections/${id}`, { credentials: 'include' })
        const data = await response.json().catch(() => ({}))
        if (cancelled) return
        if (response.ok) {
          setInspection(data)
          setLoadError(null)
        } else {
          setInspection(null)
          setLoadError(data?.error || data?.details || `Could not load inspection (${response.status})`)
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Error loading inspection:', error)
          setInspection(null)
          setLoadError(error?.message || 'Failed to load inspection')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadInspection()
    return () => {
      cancelled = true
    }
  }, [id])

  useEffect(() => {
    if (!id) {
      setActions([])
      setActionsLoading(false)
      setActionsError(null)
      return
    }

    let cancelled = false
    const loadActions = async () => {
      setActionsLoading(true)
      setActionsError(null)
      try {
        const response = await fetch(`/api/actions?inspection_id=${encodeURIComponent(id)}`, {
          cache: 'no-store',
          credentials: 'include',
        })
        const data = await response.json().catch((jsonError) => {
          console.error('Invalid JSON response from /api/actions:', jsonError)
          return null
        })

        if (cancelled) return
        if (response.ok) {
          const actionsData = Array.isArray(data)
            ? data
            : Array.isArray(data?.rows)
            ? data.rows
            : null

          if (actionsData) {
            setActions(actionsData)
            setActionsError(null)
          } else {
            console.warn('Unexpected /api/actions payload for inspection', id, data)
            setActions([])
            setActionsError(null)
          }
        } else {
          console.error('Actions API returned non-OK status', response.status, data)
          setActions([])
          setActionsError(data?.error || data?.details || `Could not load actions (${response.status})`)
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Error loading actions:', error)
          setActions([])
          setActionsError(error?.message || 'Failed to load actions')
        }
      } finally {
        if (!cancelled) setActionsLoading(false)
      }
    }

    loadActions()
    return () => {
      cancelled = true
    }
  }, [id])

  const formatDate = (dateString) => {
    if (!dateString) return '-'
    const date = new Date(dateString)
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const reloadInspection = async () => {
    if (!id) return
    try {
      const response = await fetch(`/api/inspections/${id}`, { credentials: 'include' })
      const data = await response.json().catch(() => ({}))
      if (response.ok) setInspection(data)
    } catch (e) {
      console.error('reloadInspection', e)
    }
  }

  if (loading) {
    return <div style={{ padding: '2rem' }}>Loading inspection...</div>
  }

  if (!inspection) {
    return (
      <div style={{ padding: '2rem' }}>
        {loadError ? (
          <p style={{ color: '#b45309', marginBottom: '0.75rem' }}>{loadError}</p>
        ) : (
          <p>Inspection not found</p>
        )}
        <Link href="/inspections">Back to Inspections</Link>
      </div>
    )
  }

  return (
    <div>
      <div style={{ marginBottom: '2rem' }}>
        <Link
          href="/dashboard"
          style={{
            color: '#3b82f6',
            textDecoration: 'none',
            fontSize: '0.875rem',
            display: 'inline-block',
            marginBottom: '1rem',
          }}
        >
          ← Back to Dashboard
        </Link>
        <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 'bold' }}>
          Inspection Details
        </h1>
        <p style={{ margin: '0.5rem 0 0 0', color: '#6b7280' }}>
          {inspection.location_label || inspection.id}
        </p>
      </div>

      <div style={{
        backgroundColor: 'white',
        padding: '2rem',
        borderRadius: '0.5rem',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        marginBottom: '1.5rem',
        border: '1px solid #e5e7eb'
      }}>
        <h2 style={{ margin: '0 0 1.5rem 0', fontSize: '1.25rem', fontWeight: '600' }}>
          Summary
        </h2>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: '1.5rem'
        }}>
          <div>
            <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>Type</div>
            <div style={{ fontSize: '1rem', fontWeight: '500', color: '#111827' }}>
              {inspection.type || '-'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>Location</div>
            <div style={{ fontSize: '1rem', fontWeight: '500', color: '#111827' }}>
              {inspection.location_label || '-'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>Inspector</div>
            <div style={{ fontSize: '1rem', fontWeight: '500', color: '#111827' }}>
              {inspection.inspector_name || '-'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>Template</div>
            <div style={{ fontSize: '1rem', fontWeight: '500', color: '#111827' }}>
              {inspection.template_name || '-'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>Due Date</div>
            <div style={{ fontSize: '1rem', fontWeight: '500', color: '#111827' }}>
              {formatDate(inspection.due_date)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>Completed</div>
            <div style={{ fontSize: '1rem', fontWeight: '500', color: '#111827' }}>
              {formatDate(inspection.submitted_at)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>Grading</div>
            <div style={{ fontSize: '1rem', fontWeight: '500', color: '#111827' }}>
              {inspection.grading || '-'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>Status</div>
            <div style={{ fontSize: '1rem', fontWeight: '500', color: '#111827' }}>
              {inspection.status || '-'}
            </div>
          </div>
        </div>
      </div>

      <div style={{
        backgroundColor: 'white',
        padding: '2rem',
        borderRadius: '0.5rem',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        marginBottom: '1.5rem',
        border: '1px solid #e5e7eb'
      }}>
        <h2 style={{ margin: '0 0 1.5rem 0', fontSize: '1.25rem', fontWeight: '600' }}>
          Actions
        </h2>
        <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
          Actions logged during this inspection will appear here.
        </p>
        {actionsLoading ? (
          <p style={{ color: '#6b7280' }}>Loading actions...</p>
        ) : actionsError ? (
          <p style={{ color: '#b45309' }}>{actionsError}</p>
        ) : actions.length === 0 ? (
          <p style={{ color: '#6b7280' }}>No actions were logged for this inspection.</p>
        ) : (
          <div style={{ display: 'grid', gap: '1rem' }}>
            {actions.map((action) => (
              <div
                key={action.id}
                style={{
                  padding: '1rem',
                  borderRadius: '0.5rem',
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                  <div style={{ fontSize: '1rem', fontWeight: 600, color: '#111827' }}>{action.title || 'Action'}</div>
                  <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>{action.status || 'open'}</div>
                </div>
                {action.category ? (
                  <div style={{ marginTop: '0.25rem', color: '#475569' }}>{action.category}</div>
                ) : null}
                {action.comment ? (
                  <p style={{ margin: '0.75rem 0 0 0', color: '#334155' }}>{action.comment}</p>
                ) : null}
                {action.description && action.description !== action.comment ? (
                  <p style={{ margin: '0.5rem 0 0 0', color: '#334155' }}>{action.description}</p>
                ) : null}
                {action.location ? (
                  <div style={{ marginTop: '0.75rem', fontSize: '0.875rem', color: '#6b7280' }}>
                    Location: {action.location}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{
        backgroundColor: 'white',
        padding: '2rem',
        borderRadius: '0.5rem',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        border: '1px solid #e5e7eb'
      }}>
        <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.25rem', fontWeight: '600' }}>
          PDFs
        </h2>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {id && <GeneratePosterButton inspectionId={id} />}
          {id && <GenerateRepairsUpdatePdfButton inspectionId={id} />}
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <InspectionFullPdfControls
              inspectionId={inspection.id}
              inspection={inspection}
              pdfGenerationError={inspection.pdf_generation_error}
              onAfterGenerate={reloadInspection}
            />
          </div>
          {inspection.pdf_generation_error && !getInspectionFullReportPdfUrl(inspection) && (
            <p style={{ color: '#b45309', fontSize: '0.875rem', marginTop: 8 }}>
              Last PDF error: {String(inspection.pdf_generation_error)}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
