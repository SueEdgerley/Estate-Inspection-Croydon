'use client'

import { useEffect, useState } from 'react'

function cellStyle(extra = {}) {
  return {
    border: '1px solid #d1d5db',
    padding: '0.5rem',
    verticalAlign: 'top',
    ...extra,
  }
}

export default function TemplateDiagnosticsPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch('/api/admin/template-diagnostics', { credentials: 'include', cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(body.error || body.details || 'Failed to load template diagnostics')
        return body
      })
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p>Loading template diagnostics...</p>
  if (error) return <p style={{ color: '#b91c1c' }}>{error}</p>

  const rows = Array.isArray(data?.diagnostics) ? data.diagnostics : []

  return (
    <div>
      <h1>Template diagnostics</h1>
      <p style={{ color: '#4b5563', maxWidth: 900 }}>
        Temporary diagnostic view for the same template-loading path used by <code>/inspections/new</code>.
        Use this before rendering changes to confirm each active form has sections and questions.
      </p>
      <p style={{ color: '#4b5563' }}>
        Source: <strong>{data?.source || 'Unknown'}</strong>
      </p>

      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.875rem' }}>
        <thead>
          <tr>
            <th style={cellStyle({ textAlign: 'left' })}>Template</th>
            <th style={cellStyle({ textAlign: 'left' })}>template_id</th>
            <th style={cellStyle({ textAlign: 'right' })}>Sections</th>
            <th style={cellStyle({ textAlign: 'right' })}>Questions</th>
            <th style={cellStyle({ textAlign: 'right' })}>Hidden</th>
            <th style={cellStyle({ textAlign: 'left' })}>After /inspections/new patches</th>
            <th style={cellStyle({ textAlign: 'left' })}>First 10 questions</th>
            <th style={cellStyle({ textAlign: 'left' })}>Warnings</th>
            <th style={cellStyle({ textAlign: 'left' })}>Raw</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.template_id || row.template_name}>
              <td style={cellStyle({ fontWeight: 600 })}>{row.template_name}</td>
              <td style={cellStyle({ fontFamily: 'monospace', fontSize: '0.8rem' })}>{row.template_id || '—'}</td>
              <td style={cellStyle({ textAlign: 'right' })}>{row.section_count}</td>
              <td style={cellStyle({ textAlign: 'right', color: row.question_count === 0 ? '#b91c1c' : undefined })}>
                {row.question_count}
              </td>
              <td style={cellStyle({ textAlign: 'right' })}>{row.hidden_question_count}</td>
              <td style={cellStyle()}>
                {row.after_client_patch
                  ? `${row.after_client_patch.section_count} sections, ${row.after_client_patch.question_count} questions, ${row.after_client_patch.hidden_question_count} hidden`
                  : '—'}
              </td>
              <td style={cellStyle()}>
                <ol style={{ margin: 0, paddingLeft: '1.25rem' }}>
                  {(row.first_10_questions || []).map((question, index) => (
                    <li key={`${question.question_id || index}-${index}`} style={{ marginBottom: '0.25rem' }}>
                      <span>{question.name || '(blank question)'}</span>
                      {question.hidden ? <span style={{ color: '#b91c1c' }}> hidden</span> : null}
                    </li>
                  ))}
                </ol>
              </td>
              <td style={cellStyle({ color: row.warnings?.length ? '#b45309' : '#047857' })}>
                {row.warnings?.length ? row.warnings.join('; ') : 'None'}
              </td>
              <td style={cellStyle()}>
                {row.template_id ? (
                  <a
                    href={`/api/admin/template-diagnostics?template_id=${encodeURIComponent(row.template_id)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    JSON
                  </a>
                ) : (
                  '—'
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {rows.length === 0 ? <p>No templates returned.</p> : null}
    </div>
  )
}
