'use client'

import { useState } from 'react'

export function GeneratePosterButton({ inspectionId }) {
  const [loading, setLoading] = useState(false)

  async function onClick() {
    try {
      setLoading(true)
      const res = await fetch('/api/poster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inspectionId }),
      })

      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || 'Failed to generate poster')
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (err) {
      console.error('Poster generation failed:', err)
      alert(err.message || 'Failed to generate poster')
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
        border: '1px solid #d1d5db',
        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
        backgroundColor: loading ? '#9ca3af' : 'white',
        color: loading ? '#fff' : '#374151',
        fontWeight: 500,
        fontSize: '0.875rem',
        cursor: loading ? 'not-allowed' : 'pointer',
      }}
    >
      {loading ? 'Generating…' : 'Generate poster (PDF)'}
    </button>
  )
}
