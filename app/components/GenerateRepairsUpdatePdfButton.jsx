'use client'

import { useState } from 'react'

export default function GenerateRepairsUpdatePdfButton({ inspectionId }) {
  const [loading, setLoading] = useState(false)

  async function onClick() {
    if (!inspectionId) return
    try {
      setLoading(true)
      const res = await fetch(`/api/inspections/${inspectionId}/repairs-update-pdf`, {
        method: 'POST',
        credentials: 'include',
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.details || data?.error || `Failed to generate repairs update (${res.status})`)
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank', 'noopener,noreferrer')
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (err) {
      console.error('Repairs update PDF generation failed:', err)
      window.alert(err?.message || 'Failed to generate repairs update PDF')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      style={{
        padding: '0.5rem 1rem',
        borderRadius: '0.5rem',
        border: '1px solid #1d4ed8',
        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
        backgroundColor: loading ? '#93c5fd' : '#1d4ed8',
        color: '#fff',
        fontWeight: 600,
        fontSize: '0.875rem',
        cursor: loading ? 'not-allowed' : 'pointer',
      }}
    >
      {loading ? 'Generating...' : 'Repairs poster PDF'}
    </button>
  )
}
