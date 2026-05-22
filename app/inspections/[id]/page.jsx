'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import GenerateRepairsUpdatePdfButton from '@/app/components/GenerateRepairsUpdatePdfButton'
import GenerateWalkaboutActionPlanPdfButton from '@/app/components/GenerateWalkaboutActionPlanPdfButton'
import GenerateWalkaboutResidentPosterPdfButton from '@/app/components/GenerateWalkaboutResidentPosterPdfButton'
import InspectionFullPdfControls from '@/app/components/InspectionFullPdfControls'
import InspectionFollowUpUpdates from '@/app/components/inspection/InspectionFollowUpUpdates'
import InspectionActionCard from '@/app/components/actions/InspectionActionCard'
import { getInspectionFullReportPdfUrl } from '@/lib/inspection-pdf-fields'
import { inspectionIsCaretaker } from '@/lib/caretaker-template'
import {
  canAddInspectionFollowUpUpdate,
  inspectionIsSubmitted,
} from '@/lib/inspection-follow-up-updates'

const ACTION_STATUS_OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Complete' },
]

function isEsmInspectionRecord(inspection) {
  const text = [
    inspection?.template_name,
    inspection?.template_key,
    inspection?.type,
    inspection?.source,
  ].filter(Boolean).join(' ').toLowerCase()
  if (!text) return false
  if (text.includes('walkabout') || text.includes('caretaker') || text.includes('neighbourhood voice')) return false
  return text.includes('esm') || text.includes('estate inspection')
}

export default function InspectionDetail() {
  const params = useParams()
  const searchParams = useSearchParams()
  const autoFocusFollowUp = searchParams?.get('addUpdate') === '1'
  // Match wizard: dynamic [id] can be string | string[]; never await useParams() (sync hook).
  const id =
    typeof params?.id === 'string' ? params.id : Array.isArray(params?.id) ? params.id[0] : undefined
  const [inspection, setInspection] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [actions, setActions] = useState([])
  const [actionsLoading, setActionsLoading] = useState(true)
  const [actionsError, setActionsError] = useState(null)
  const [editingActionId, setEditingActionId] = useState('')
  const [actionEditForm, setActionEditForm] = useState({
    status: 'open',
    comment: '',
  })
  const [actionSaving, setActionSaving] = useState(false)
  const [actionMessage, setActionMessage] = useState('')
  const [actionSaveError, setActionSaveError] = useState('')
  const [roleUi, setRoleUi] = useState(null)
  const [viewerEmail, setViewerEmail] = useState('')

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
    let cancelled = false
    fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : {}))
      .then((data) => {
        if (cancelled) return
        setRoleUi(data?.roleUi && typeof data.roleUi === 'object' ? data.roleUi : null)
        setViewerEmail(typeof data?.email === 'string' ? data.email : '')
      })
      .catch(() => {
        if (!cancelled) {
          setRoleUi(null)
          setViewerEmail('')
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const loadActions = useCallback(async ({ quiet = false } = {}) => {
    if (!id) {
      setActions([])
      setActionsLoading(false)
      setActionsError(null)
      return
    }

    if (!quiet) setActionsLoading(true)
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
      console.error('Error loading actions:', error)
      setActions([])
      setActionsError(error?.message || 'Failed to load actions')
    } finally {
      if (!quiet) setActionsLoading(false)
    }
  }, [id])

  useEffect(() => {
    if (!id) {
      setActions([])
      setActionsLoading(false)
      setActionsError(null)
      return undefined
    }
    loadActions()
  }, [id, loadActions])

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

  const startEditAction = (action) => {
    setEditingActionId(action.id)
    setActionEditForm({
      status: action.status || 'open',
      comment: action.comment || '',
    })
    setActionMessage('')
    setActionSaveError('')
  }

  const saveActionUpdate = async (actionId) => {
    setActionSaving(true)
    setActionMessage('')
    setActionSaveError('')
    try {
      const response = await fetch(`/api/actions/${encodeURIComponent(actionId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          status: actionEditForm.status || 'open',
          comment: actionEditForm.comment.trim() || null,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setActionSaveError(data?.details || data?.error || `Could not update action (${response.status})`)
        return
      }
      setActions((currentActions) =>
        currentActions.map((action) => (action.id === actionId ? { ...action, ...data } : action))
      )
      setActionMessage('Action updated.')
      setEditingActionId('')
      await loadActions({ quiet: true })
    } catch (error) {
      setActionSaveError(error?.message || 'Could not update action')
    } finally {
      setActionSaving(false)
    }
  }

  const isWalkaboutInspection =
    String(inspection?.type || '').toLowerCase() === 'estate_walkabout' ||
    String(inspection?.template_name || '').toLowerCase().includes('walkabout') ||
    String(inspection?.template_key || '').toLowerCase() === 'estate_walkabout'
  const isEsmInspection = isEsmInspectionRecord(inspection)
  const isSubmitted = inspectionIsSubmitted(inspection)
  const isCaretakerInspection = inspectionIsCaretaker(inspection)
  const isCaretakerViewer = roleUi?.normalizedRole === 'caretaker'
  const canEditActions = !isCaretakerViewer
  const canAddFollowUp =
    inspection &&
    canAddInspectionFollowUpUpdate({
      roleCtx: {
        jobTitle: roleUi?.jobTitle,
        normalized: roleUi?.normalizedRole,
        systemRole: roleUi?.systemRole,
        clerkIsAdmin: roleUi?.clerkIsAdmin,
      },
      userEmail: viewerEmail,
      inspection,
    })
  const backHref = isCaretakerViewer ? '/caretaker/my-inspections' : '/dashboard'
  const backLabel = isCaretakerViewer ? 'My inspections' : 'Dashboard'

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
          href={backHref}
          style={{
            color: '#3b82f6',
            textDecoration: 'none',
            fontSize: '0.875rem',
            display: 'inline-block',
            marginBottom: '1rem',
          }}
        >
          ← Back to {backLabel}
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

      {isSubmitted && isCaretakerInspection ? (
        <div
          style={{
            marginBottom: '1.5rem',
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
      ) : null}

      <InspectionFollowUpUpdates
        inspectionId={id}
        isSubmitted={isSubmitted}
        canAdd={canAddFollowUp}
        autoFocusForm={autoFocusFollowUp}
      />

      <div style={{
        backgroundColor: 'white',
        padding: '2rem',
        borderRadius: '0.5rem',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        marginBottom: '1.5rem',
        border: '1px solid #e5e7eb'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '600' }}>
            Actions
          </h2>
          {id && isEsmInspection ? (
            <Link
              href={`/actions?inspection_id=${encodeURIComponent(id)}`}
              style={{
                padding: '0.6rem 1rem',
                borderRadius: '0.5rem',
                border: '1px solid #0f766e',
                backgroundColor: '#0f766e',
                color: 'white',
                textDecoration: 'none',
                fontWeight: 600,
              }}
            >
              Open Action Plan
            </Link>
          ) : null}
        </div>
        <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
          Actions logged during this inspection will appear here.
        </p>
        {actionMessage ? <p style={{ color: '#166534', marginBottom: '1rem' }}>{actionMessage}</p> : null}
        {actionSaveError ? <p style={{ color: '#b91c1c', marginBottom: '1rem' }}>{actionSaveError}</p> : null}
        {actionsLoading ? (
          <p style={{ color: '#6b7280' }}>Loading actions...</p>
        ) : actionsError ? (
          <p style={{ color: '#b45309' }}>{actionsError}</p>
        ) : actions.length === 0 ? (
          <p style={{ color: '#6b7280' }}>No actions were logged for this inspection.</p>
        ) : (
          <div style={{ display: 'grid', gap: '1rem' }}>
            {actions.map((action) => (
              <InspectionActionCard
                key={action.id}
                action={action}
                canEdit={canEditActions}
                isEditing={editingActionId === action.id}
                editForm={actionEditForm}
                onEditFormChange={setActionEditForm}
                onStartEdit={() => startEditAction(action)}
                onCancelEdit={() => setEditingActionId('')}
                onSave={() => saveActionUpdate(action.id)}
                saving={actionSaving}
                statusOptions={ACTION_STATUS_OPTIONS}
              />
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
          {id && <GenerateRepairsUpdatePdfButton inspectionId={id} />}
          {id && isWalkaboutInspection && <GenerateWalkaboutActionPlanPdfButton inspectionId={id} />}
          {id && isWalkaboutInspection && <GenerateWalkaboutResidentPosterPdfButton inspectionId={id} />}
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
