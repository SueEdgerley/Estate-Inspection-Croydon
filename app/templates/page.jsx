'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

export default function TemplatesPage() {
  const [data, setData] = useState({ templates: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => {
    fetch('/api/templates')
      .then((res) => {
        if (!res.ok) throw new Error(res.status === 503 ? 'Airtable not configured' : 'Failed to load templates')
        return res.json()
      })
      .then((d) => setData(d))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const templates = data.templates || []

  return (
    <div>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 'bold', color: '#111827' }}>
          Templates
        </h1>
        <p style={{ margin: '0.5rem 0 0 0', color: '#6b7280' }}>
          Inspection templates from Airtable (read-only)
        </p>
      </div>

      {loading && (
        <p style={{ color: '#6b7280' }}>Loading templates…</p>
      )}

      {error && (
        <div style={{
          padding: '1rem',
          backgroundColor: '#fee2e2',
          color: '#dc2626',
          borderRadius: '0.5rem',
          marginBottom: '1rem',
        }}>
          <p style={{ margin: 0, fontWeight: 500 }}>{error}</p>
          {error.toLowerCase().includes('airtable') && (
            <p style={{ margin: '0.75rem 0 0 0', fontSize: '0.875rem', color: '#991b1b' }}>
              In Vercel: Settings → Environment Variables. Set <strong>AIRTABLE_BASE_ID</strong> and <strong>AIRTABLE_API_TOKEN</strong> (or <strong>AIRTABLE_API_KEY</strong>) for <strong>Production</strong>, then redeploy.
              {' '}
              <a href="/api/airtable-status" target="_blank" rel="noopener noreferrer" style={{ color: '#dc2626', textDecoration: 'underline' }}>
                Check what the server sees →
              </a>
            </p>
          )}
        </div>
      )}

      {!loading && !error && templates.length === 0 && (
        <div style={{
          backgroundColor: 'white',
          padding: '2rem',
          borderRadius: '0.5rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          textAlign: 'center',
          color: '#6b7280',
        }}>
          No templates found. Add active templates in Airtable and set AIRTABLE_BASE_ID and AIRTABLE_API_KEY.
        </div>
      )}

      {!loading && !error && templates.length > 0 && (
        <div style={{
          backgroundColor: 'white',
          borderRadius: '0.5rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          overflow: 'hidden',
        }}>
          {templates.map((t) => {
            const isExpanded = expandedId === t.id
            const sectionCount = (t.sections || []).length
            const questionCount = (t.sections || []).reduce((n, s) => n + (s.questions || []).length, 0)
            return (
              <div
                key={t.id}
                style={{
                  borderBottom: '1px solid #e5e7eb',
                }}
              >
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : t.id)}
                  style={{
                    width: '100%',
                    padding: '1rem 1.25rem',
                    textAlign: 'left',
                    border: 'none',
                    background: isExpanded ? '#f9fafb' : 'transparent',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '1rem',
                    fontWeight: 500,
                    color: '#111827',
                  }}
                >
                  <span>{t.name || t.template_key || t.id}</span>
                  <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>
                    {sectionCount} section{sectionCount !== 1 ? 's' : ''}, {questionCount} question{questionCount !== 1 ? 's' : ''}
                  </span>
                </button>
                {isExpanded && (
                  <div style={{ padding: '0 1.25rem 1.25rem', backgroundColor: '#f9fafb' }}>
                    {(t.sections || []).map((sec) => (
                      <div key={sec.id} style={{ marginTop: '1rem' }}>
                        <div style={{ fontWeight: 600, color: '#374151', marginBottom: '0.5rem' }}>
                          {sec.title}
                          {sec.help_text && (
                            <span style={{ fontWeight: 400, color: '#6b7280', fontSize: '0.875rem' }}>
                              {' — '}{sec.help_text}
                            </span>
                          )}
                        </div>
                        <ul style={{ margin: 0, paddingLeft: '1.25rem', color: '#4b5563', fontSize: '0.875rem' }}>
                          {(sec.questions || []).map((q) => (
                            <li key={q.id} style={{ marginBottom: '0.25rem' }}>
                              {q.question_text}
                              <span style={{ color: '#9ca3af' }}> ({q.question_type || 'text'})</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                    <div style={{ marginTop: '1rem' }}>
                      <Link
                        href={`/inspections/new`}
                        style={{ color: '#3b82f6', fontSize: '0.875rem', textDecoration: 'none' }}
                      >
                        Start new inspection with this template →
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {!loading && templates.length > 0 && (
        <p style={{ marginTop: '1rem', fontSize: '0.875rem', color: '#6b7280' }}>
          <Link href="/inspections/new" style={{ color: '#3b82f6', textDecoration: 'none' }}>
            Start new inspection
          </Link>
          {' '}to use a template.
        </p>
      )}
    </div>
  )
}
