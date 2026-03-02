'use client'

import { useEffect, useState } from 'react'

export default function TemplatesTestPage() {
  const [json, setJson] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/templates', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        setJson(data)
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  if (loading) return <p>Loading /api/templates...</p>
  if (error) return <p style={{ color: 'red' }}>Error: {error}</p>

  return (
    <div style={{ padding: '1rem', maxWidth: '100%', overflow: 'auto' }}>
      <h1 style={{ marginBottom: '0.5rem', fontSize: '1.25rem' }}>Debug: /api/templates</h1>
      <p style={{ color: '#6b7280', marginBottom: '1rem', fontSize: '0.875rem' }}>
        Temporary debug page – raw JSON from GET /api/templates
      </p>
      <pre
        style={{
          background: '#1f2937',
          color: '#e5e7eb',
          padding: '1rem',
          borderRadius: '0.5rem',
          overflow: 'auto',
          fontSize: '0.8125rem',
          margin: 0,
        }}
      >
        {JSON.stringify(json, null, 2)}
      </pre>
    </div>
  )
}
