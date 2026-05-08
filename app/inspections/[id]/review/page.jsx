'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

/**
 * Format heterogeneous failure entries from POST /api/inspections/[id]/submit (email_failures, etc.)
 */
function formatFailureEntry(entry) {
  if (entry == null) return ''
  if (typeof entry === 'string') return entry
  if (typeof entry === 'object') {
    const bits = [
      entry.email,
      entry.recipient,
      entry.recipient_id,
      entry.category,
    ].filter(Boolean)
    const head = bits[0] ? String(bits[0]) : ''
    const err = entry.error || entry.message
    if (head && err) return `${head}: ${err}`
    if (err) return String(err)
    try {
      return JSON.stringify(entry)
    } catch {
      return String(entry)
    }
  }
  return String(entry)
}

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

export default function InspectionReview() {
  const params = useParams()
  const router = useRouter()
  const id =
    typeof params?.id === 'string' ? params.id : Array.isArray(params?.id) ? params.id[0] : undefined

  const [inspection, setInspection] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  /** Set after HTTP 201 from submit — inspection is saved; optional partial failures */
  const [submitOutcome, setSubmitOutcome] = useState(null)
  /** Set when submit returns !ok — route or validation failure */
  const [submitRouteError, setSubmitRouteError] = useState(null)

  useEffect(() => {
    if (!id) {
      setLoading(false)
      setInspection(null)
      setLoadError(null)
      return
    }

    let cancelled = false
    async function loadInspection() {
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
      } catch (e) {
        if (!cancelled) {
          console.error('Error loading inspection:', e)
          setInspection(null)
          setLoadError(e?.message || 'Failed to load inspection')
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

  const handleSubmit = async () => {
    if (!id) return

    setIsSubmitting(true)
    setSubmitRouteError(null)
    setSubmitOutcome(null)
    try {
      const response = await fetch(`/api/inspections/${id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        const msg =
          data?.error ||
          data?.details ||
          (response.status === 500
            ? 'Submit failed (server error). Check Vercel function logs for "Error submitting inspection".'
            : `Submit failed (${response.status})`)
        setSubmitRouteError(msg)
        console.error('[inspection review submit] failed:', response.status, data)
        return
      }

      // 201: inspection row is already marked submitted server-side; body may include partial-failure hints
      const actionWarnings = Array.isArray(data.action_creation_warnings) ? data.action_creation_warnings : []
      const emailFailures = Array.isArray(data.email_failures) ? data.email_failures : []
      const pdfError = data.pdfError ? String(data.pdfError) : null

      setSubmitOutcome({
        emails_sent: typeof data.emails_sent === 'number' ? data.emails_sent : 0,
        action_creation_warnings: actionWarnings,
        email_failures: emailFailures,
        pdfError,
        fullPdfUrl: data.fullPdfUrl || data.pdfUrl || null,
        posterPdfUrl: data.posterPdfUrl || null,
      })
    } catch (error) {
      console.error('Error submitting inspection:', error)
      setSubmitRouteError(error?.message || 'Network or unexpected error while submitting.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!id) {
    return (
      <div style={{ padding: '2rem' }}>
        <p>Missing inspection id.</p>
        <Link href="/inspections">Back to Inspections</Link>
      </div>
    )
  }

  if (loading) {
    return <div style={{ padding: '2rem' }}>Loading inspection...</div>
  }

  if (loadError || !inspection) {
    return (
      <div style={{ padding: '2rem' }}>
        <p style={{ color: '#b45309', marginBottom: '0.75rem' }}>{loadError || 'Inspection not found'}</p>
        <Link href="/inspections">Back to Inspections</Link>
      </div>
    )
  }

  const submittedAlready = String(inspection.status || '').toLowerCase() === 'submitted'
  const isEsmInspection = isEsmInspectionRecord(inspection)

  return (
    <div>
      <div style={{ marginBottom: '2rem' }}>
        <Link
          href={`/inspections/${id}`}
          style={{
            color: '#3b82f6',
            textDecoration: 'none',
            fontSize: '0.875rem',
            display: 'inline-block',
            marginBottom: '1rem',
          }}
        >
          ← Back to Inspection
        </Link>
        <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 'bold' }}>
          Review & Submit
        </h1>
        <p style={{ margin: '0.5rem 0 0 0', color: '#6b7280' }}>
          Review your inspection before submitting
        </p>
      </div>

      {submitRouteError && (
        <div
          style={{
            marginBottom: '1rem',
            padding: '1rem',
            backgroundColor: '#fee2e2',
            color: '#991b1b',
            borderRadius: '0.5rem',
            fontSize: '0.9375rem',
            border: '1px solid #fecaca',
          }}
        >
          <strong>Submit did not complete successfully.</strong>
          <p style={{ margin: '0.5rem 0 0 0' }}>{submitRouteError}</p>
          <p style={{ margin: '0.75rem 0 0 0', fontSize: '0.875rem', color: '#7f1d1d' }}>
            If the HTTP status was 500, check Vercel logs for <code style={{ fontSize: '0.8em' }}>Error submitting inspection</code>.
            Refresh the inspection detail page to confirm whether it was still marked submitted.
          </p>
        </div>
      )}

      {submitOutcome && (
        <div style={{ marginBottom: '1.5rem' }}>
          <div
            style={{
              padding: '1rem',
              backgroundColor: '#ecfdf5',
              color: '#065f46',
              borderRadius: '0.5rem',
              fontSize: '0.9375rem',
              border: '1px solid #a7f3d0',
              marginBottom: '0.75rem',
            }}
          >
            <strong>Inspection saved and submitted.</strong>
            <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.875rem' }}>
              Emails reported sent: {submitOutcome.emails_sent}
              {submitOutcome.fullPdfUrl ? (
                <>
                  {' '}
                  ·{' '}
                  <a href={submitOutcome.fullPdfUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#047857' }}>
                    Open report PDF
                  </a>
                </>
              ) : null}
            </p>
          </div>

          {submitOutcome.action_creation_warnings.length > 0 && (
            <div
              style={{
                padding: '1rem',
                backgroundColor: '#fffbeb',
                color: '#92400e',
                borderRadius: '0.5rem',
                fontSize: '0.875rem',
                border: '1px solid #fde68a',
                marginBottom: '0.75rem',
              }}
            >
              <strong>Action automation had problems (your answers are still saved).</strong>
              <ul style={{ margin: '0.5rem 0 0 1rem', padding: 0 }}>
                {submitOutcome.action_creation_warnings.map((w, i) => (
                  <li key={i} style={{ marginBottom: 4 }}>
                    {w}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {submitOutcome.email_failures.length > 0 && (
            <div
              style={{
                padding: '1rem',
                backgroundColor: '#fffbeb',
                color: '#92400e',
                borderRadius: '0.5rem',
                fontSize: '0.875rem',
                border: '1px solid #fde68a',
                marginBottom: '0.75rem',
              }}
            >
              <strong>Email delivery failed for some recipients (inspection still saved).</strong>
              <ul style={{ margin: '0.5rem 0 0 1rem', padding: 0 }}>
                {submitOutcome.email_failures.map((f, i) => (
                  <li key={i} style={{ marginBottom: 4 }}>
                    {formatFailureEntry(f)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {submitOutcome.pdfError && (
            <div
              style={{
                padding: '1rem',
                backgroundColor: '#fffbeb',
                color: '#92400e',
                borderRadius: '0.5rem',
                fontSize: '0.875rem',
                border: '1px solid #fde68a',
                marginBottom: '0.75rem',
              }}
            >
              <strong>PDF generation failed (inspection still saved).</strong>
              <p style={{ margin: '0.5rem 0 0 0', whiteSpace: 'pre-wrap' }}>{submitOutcome.pdfError}</p>
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            {isEsmInspection ? (
              <Link
                href={`/actions?inspection_id=${encodeURIComponent(id)}`}
                style={{
                  padding: '0.75rem 1.5rem',
                  backgroundColor: '#0f766e',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.5rem',
                  fontSize: '1rem',
                  fontWeight: '500',
                  cursor: 'pointer',
                  textDecoration: 'none',
                  display: 'inline-block',
                }}
              >
                Open Action Plan
              </Link>
            ) : null}
            <button
              type="button"
              onClick={() => router.push('/dashboard')}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: '#1d4ed8',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                fontSize: '1rem',
                fontWeight: '500',
                cursor: 'pointer',
              }}
            >
              Continue to dashboard
            </button>
          </div>
        </div>
      )}

      <div
        style={{
          backgroundColor: 'white',
          padding: '2rem',
          borderRadius: '0.5rem',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          marginBottom: '1.5rem',
        }}
      >
        <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.25rem', fontWeight: '600' }}>
          Inspection Details
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <strong>Inspection ID:</strong> {inspection.id ?? id}
          </div>
          {inspection.template_name && (
            <div>
              <strong>Template:</strong> {inspection.template_name}
            </div>
          )}
          {(inspection.location_label || inspection.location) && (
            <div>
              <strong>Block / Estate:</strong> {inspection.location_label || inspection.location}
            </div>
          )}
          {(inspection.submitted_at || inspection.created_at) && (
            <div>
              <strong>Created / updated:</strong>{' '}
              {new Date(inspection.created_at || inspection.submitted_at).toLocaleDateString('en-GB')}
            </div>
          )}
          {inspection.description && (
            <div>
              <strong>Description:</strong> {inspection.description}
            </div>
          )}
          <div>
            <strong>Status:</strong> {inspection.status || '—'}
            {submittedAlready && (
              <span style={{ marginLeft: 8, fontSize: '0.875rem', color: '#6b7280' }}>
                (already submitted — submit again only if your workflow allows it)
              </span>
            )}
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          gap: '1rem',
          justifyContent: 'flex-end',
        }}
      >
        <Link
          href={`/inspections/${id}`}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: 'white',
            color: '#374151',
            border: '1px solid #d1d5db',
            borderRadius: '0.5rem',
            textDecoration: 'none',
            fontSize: '1rem',
            fontWeight: '500',
            display: 'inline-block',
          }}
        >
          Back to Inspection
        </Link>
        {!submitOutcome && (
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || submittedAlready}
            title={submittedAlready ? 'This inspection is already submitted' : undefined}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: isSubmitting || submittedAlready ? '#9ca3af' : '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              fontSize: '1rem',
              fontWeight: '500',
              cursor: isSubmitting || submittedAlready ? 'not-allowed' : 'pointer',
            }}
          >
            {isSubmitting ? 'Submitting...' : submittedAlready ? 'Already submitted' : 'Submit inspection'}
          </button>
        )}
      </div>
    </div>
  )
}
