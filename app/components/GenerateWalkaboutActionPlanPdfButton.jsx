'use client'

import { useState } from 'react'

export default function GenerateWalkaboutActionPlanPdfButton({ inspectionId }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const openPdf = async () => {
    if (!inspectionId || loading) return
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/inspections/${encodeURIComponent(inspectionId)}/walkabout-action-plan-pdf`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data?.details || data?.error || `Could not generate action plan (${response.status})`)
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank', 'noopener,noreferrer')
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (err) {
      setError(err?.message || 'Could not generate action plan')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={openPdf}
        disabled={loading}
        style={{
          padding: '0.75rem 1.25rem',
          borderRadius: '0.5rem',
          border: '1px solid #1d4ed8',
          backgroundColor: loading ? '#93c5fd' : '#1d4ed8',
          color: 'white',
          fontWeight: 600,
          cursor: loading ? 'wait' : 'pointer',
        }}
      >
        {loading ? 'Generating...' : 'Print Action Plan'}
      </button>
      {error ? (
        <p style={{ margin: '0.5rem 0 0 0', color: '#b45309', fontSize: '0.875rem' }}>{error}</p>
      ) : null}
    </div>
  )
}
