'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { getAllIssues, updateIssue } from '@/lib/issues'
import { ISSUE_TYPE_LABELS, ISSUE_STATUS_LABELS } from '@/lib/issues'

export default function InspectionReview() {
  const params = useParams()
  const router = useRouter()
  const [id, setId] = useState(null)

  useEffect(() => {
    const loadParams = async () => {
      const resolvedParams = await params
      setId(resolvedParams.id)
    }
    loadParams()
  }, [params])
  const [inspection, setInspection] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    const loadInspection = async () => {
      try {
        const issues = await getAllIssues()
        const found = issues.find(i => i.id === id)
        if (found) {
          setInspection(found)
        }
      } catch (error) {
        console.error('Error loading inspection:', error)
      } finally {
        setLoading(false)
      }
    }

    if (id) {
      loadInspection()
    }
  }, [id])

  const handleSubmit = async () => {
    if (!inspection) return

    setIsSubmitting(true)
    try {
      const response = await fetch(`/api/inspections/${id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to submit inspection')
      }

      const result = await response.json()

      await updateIssue(id, {
        status: 'submitted',
        submitted_at: new Date().toISOString(),
        pdf_url: result.pdf_url
      })

      alert(`Inspection submitted successfully! PDF generated and ${result.emails_sent} email(s) sent.`)
      router.push('/dashboard')
    } catch (error) {
      console.error('Error submitting inspection:', error)
      alert(`Failed to submit inspection: ${error.message}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (loading) {
    return <div style={{ padding: '2rem' }}>Loading inspection...</div>
  }

  if (!inspection) {
    return (
      <div style={{ padding: '2rem' }}>
        <p>Inspection not found</p>
        <Link href="/inspections">Back to Inspections</Link>
      </div>
    )
  }

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

      <div style={{
        backgroundColor: 'white',
        padding: '2rem',
        borderRadius: '0.5rem',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        marginBottom: '1.5rem'
      }}>
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
          {(inspection.submitted_at || inspection.created_at || inspection.createdAt) && (
            <div>
              <strong>Date:</strong> {new Date(inspection.submitted_at || inspection.created_at || inspection.createdAt).toLocaleDateString('en-GB')}
            </div>
          )}
          <div>
            <strong>Type:</strong> {ISSUE_TYPE_LABELS[inspection.type] || inspection.type}
          </div>
          {inspection.location && !inspection.location_label && (
            <div>
              <strong>Location:</strong> {inspection.location}
            </div>
          )}
          {inspection.description && (
            <div>
              <strong>Description:</strong> {inspection.description}
            </div>
          )}
          <div>
            <strong>Status:</strong> {ISSUE_STATUS_LABELS[inspection.status] || inspection.status}
          </div>
        </div>
      </div>

      <div style={{
        display: 'flex',
        gap: '1rem',
        justifyContent: 'flex-end'
      }}>
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
          Back to Edit
        </Link>
        <button
          onClick={handleSubmit}
          disabled={isSubmitting}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: isSubmitting ? '#9ca3af' : '#10b981',
            color: 'white',
            border: 'none',
            borderRadius: '0.5rem',
            fontSize: '1rem',
            fontWeight: '500',
            cursor: isSubmitting ? 'not-allowed' : 'pointer',
          }}
        >
          {isSubmitting ? 'Submitting...' : 'Submit Inspection'}
        </button>
      </div>
    </div>
  )
}
