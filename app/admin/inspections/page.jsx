'use client'

import { useState, useEffect } from 'react'

export default function AdminInspectionsPage() {
  const [inspections, setInspections] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch('/api/admin/inspections', { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setInspections(data)
        else if (data.error) setError(data.error)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p>Loading…</p>
  if (error) return <p style={{ color: 'red' }}>{error}</p>

  return (
    <div>
      <h1>Latest inspections (Postgres)</h1>
      <p>Use this to confirm saves. Each submit returns <strong>201</strong> with <strong>inspectionId</strong> — match the id below to trace.</p>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '14px' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', border: '1px solid #ccc', padding: '6px 8px' }}>inspectionId</th>
            <th style={{ textAlign: 'left', border: '1px solid #ccc', padding: '6px 8px' }}>Submitted</th>
            <th style={{ textAlign: 'left', border: '1px solid #ccc', padding: '6px 8px' }}>Template</th>
            <th style={{ textAlign: 'left', border: '1px solid #ccc', padding: '6px 8px' }}>Inspector</th>
            <th style={{ textAlign: 'left', border: '1px solid #ccc', padding: '6px 8px' }}>Status</th>
            <th style={{ textAlign: 'left', border: '1px solid #ccc', padding: '6px 8px' }}>Snapshot</th>
            <th style={{ textAlign: 'left', border: '1px solid #ccc', padding: '6px 8px' }}>PDFs</th>
          </tr>
        </thead>
        <tbody>
          {inspections.map((i) => (
            <tr key={i.id}>
              <td style={{ border: '1px solid #ccc', padding: '6px 8px', fontFamily: 'monospace' }} title={i.id}>
                {i.id.slice(0, 8)}…
              </td>
              <td style={{ border: '1px solid #ccc', padding: '6px 8px' }}>
                {i.submitted_at ? new Date(i.submitted_at).toLocaleString() : '—'}
              </td>
              <td style={{ border: '1px solid #ccc', padding: '6px 8px' }}>{i.template_name || i.template_id || '—'}</td>
              <td style={{ border: '1px solid #ccc', padding: '6px 8px' }}>{i.inspector_name || i.inspector_id || '—'}</td>
              <td style={{ border: '1px solid #ccc', padding: '6px 8px' }}>{i.status || '—'}</td>
              <td style={{ border: '1px solid #ccc', padding: '6px 8px' }}>{i.has_template_snapshot ? 'Yes' : 'No'}</td>
              <td style={{ border: '1px solid #ccc', padding: '6px 8px' }}>
                {i.full_pdf_url && <a href={i.full_pdf_url} target="_blank" rel="noopener noreferrer">Full</a>}
                {i.full_pdf_url && i.poster_pdf_url && ' · '}
                {i.poster_pdf_url && <a href={i.poster_pdf_url} target="_blank" rel="noopener noreferrer">Poster</a>}
                {!i.full_pdf_url && !i.poster_pdf_url && '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {inspections.length === 0 && <p>No inspections in Postgres yet. Submit one from the app and check the response for <code>201</code> and <code>inspectionId</code>.</p>}
    </div>
  )
}
