'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { GeneratePosterButton } from '@/app/components/GeneratePosterButton'

export default function InspectionDetail() {
  const params = useParams()
  const [id, setId] = useState(null)
  const [inspection, setInspection] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadParams = async () => {
      const resolvedParams = await params
      setId(resolvedParams.id)
    }
    loadParams()
  }, [params])

  useEffect(() => {
    if (!id) return

    const loadInspection = async () => {
      try {
        const response = await fetch(`/api/inspections/${id}`)
        if (response.ok) {
          const data = await response.json()
          setInspection(data)
        }
      } catch (error) {
        console.error('Error loading inspection:', error)
      } finally {
        setLoading(false)
      }
    }

    loadInspection()
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
      </div>

      <div style={{
        backgroundColor: 'white',
        padding: '2rem',
        borderRadius: '0.5rem',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        border: '1px solid #e5e7eb'
      }}>
        <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.25rem', fontWeight: '600' }}>
          Poster
        </h2>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {id && <GeneratePosterButton inspectionId={id} />}
          {inspection.pdf_url && (
            <a
              href={inspection.pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-block',
                padding: '0.75rem 1.5rem',
                backgroundColor: '#3b82f6',
                color: 'white',
                textDecoration: 'none',
                borderRadius: '0.5rem',
                fontWeight: '500'
              }}
            >
              View PDF
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
