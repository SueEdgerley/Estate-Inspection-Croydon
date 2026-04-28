'use client'

import { useEffect, useState } from 'react'

export default function GuidesPage() {
  const [guides, setGuides] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/admin/best-practice-guides', { credentials: 'include', cache: 'no-store' })
      .then((res) => res.json().then((data) => ({ res, data })))
      .then(({ res, data }) => {
        if (!res.ok) throw new Error(data.error || 'Failed to load guides')
        setGuides(Array.isArray(data) ? data.filter((guide) => guide.active !== false) : [])
      })
      .catch((e) => setError(e?.message || 'Failed to load guides'))
  }, [])

  return (
    <div>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 'bold', color: '#111827' }}>
          Guides
        </h1>
        <p style={{ margin: '0.5rem 0 0 0', color: '#6b7280' }}>
          Guidance and best practices for estate inspections
        </p>
      </div>

      <div style={{
        backgroundColor: 'white',
        padding: guides.length ? '1.5rem' : '3rem',
        borderRadius: '0.5rem',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        textAlign: guides.length ? 'left' : 'center'
      }}>
        {error ? <p style={{ color: '#b91c1c' }}>{error}</p> : null}
        {guides.length ? (
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {guides.map((guide) => (
              <a key={guide.id} href={guide.file_url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', padding: '1rem', border: '1px solid #e5e7eb', borderRadius: 8, color: '#1d4ed8', textDecoration: 'none', fontWeight: 700 }}>
                {guide.title}
                <span style={{ display: 'block', marginTop: 4, color: '#64748b', fontSize: '0.875rem', fontWeight: 400 }}>
                  {guide.template_name || guide.template_key || guide.template_id || 'Template guide'}
                </span>
              </a>
            ))}
          </div>
        ) : (
          <>
            <p style={{ fontSize: '1.125rem', color: '#6b7280', marginBottom: '1rem' }}>
              Guides coming soon
            </p>
            <p style={{ fontSize: '0.875rem', color: '#9ca3af' }}>
              Admins can upload PDF best practice guides and link them to forms/templates.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
