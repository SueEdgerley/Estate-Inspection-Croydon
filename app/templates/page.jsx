'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

// Match Airtable "Question Type" values that mean Yes/No/NA (e.g. "yes_no", "yes_no,photo")
function normalizeQuestionType(v) {
  if (v == null || v === '') return 'text'
  const raw = String(v).toLowerCase().trim()
  if (raw.includes('yes_no')) return 'yes_no'
  if (/yes\s*[\/\-]?\s*no|yesno|yes\s+no/.test(raw)) return 'yes_no'
  if (raw.includes('yes') && raw.includes('no')) return 'yes_no'
  const s = raw.replace(/[\s\-/]+/g, '_').replace(/_+$/g, '') || 'text'
  return s === 'yesno' ? 'yes_no' : s
}

function QuestionPreview({ q }) {
  // Fallback: if comment/photo required when "on_no", treat as yes_no even if type isn't set
  const hasYesNoBehavior = (q.comment_required_when === 'on_no' || q.photo_required_when === 'on_no') && !q.question_type
  const qType = normalizeQuestionType(q.question_type || (hasYesNoBehavior ? 'yes_no' : 'text'))
  const opts = q.options || []
  const gradingOpts = q.grading_options || ['A', 'B', 'C', 'D', 'NA']

  if (qType === 'yes_no') {
    const hasPhoto = !!q.type_includes_photo
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', marginLeft: '0.5rem', flexWrap: 'wrap' }}>
        {['Yes', 'No', 'NA'].map((opt) => (
          <span
            key={opt}
            style={{
              padding: '0.2rem 0.5rem',
              borderRadius: '0.25rem',
              backgroundColor: '#e5e7eb',
              color: '#374151',
              fontSize: '0.75rem',
              fontWeight: 500,
            }}
          >
            {opt}
          </span>
        ))}
        {hasPhoto && (
          <span style={{ fontSize: '0.7rem', color: '#6b7280', marginLeft: '0.15rem' }}>+ photo</span>
        )}
      </span>
    )
  }

  if (qType === 'graded') {
    return (
      <span style={{ display: 'inline-flex', gap: '0.25rem', marginLeft: '0.5rem', flexWrap: 'wrap' }}>
        {(gradingOpts || []).map((opt) => (
          <span
            key={opt}
            style={{
              padding: '0.2rem 0.5rem',
              borderRadius: '0.25rem',
              backgroundColor: '#dbeafe',
              color: '#1e40af',
              fontSize: '0.75rem',
              fontWeight: 500,
            }}
          >
            {opt}
          </span>
        ))}
        {q.grading_scheme_name && (
          <span style={{ fontSize: '0.7rem', color: '#6b7280', marginLeft: '0.25rem' }}>({q.grading_scheme_name})</span>
        )}
      </span>
    )
  }

  if (qType === 'select' || qType === 'single_select') {
    const options = opts.map((o) => (typeof o === 'string' ? o : (o?.value ?? o?.label ?? o))).filter(Boolean)
    return (
      <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: '#6b7280' }}>
        Dropdown{options.length ? `: ${options.slice(0, 5).join(', ')}${options.length > 5 ? '…' : ''}` : ''}
      </span>
    )
  }

  if (qType === 'rating') {
    return (
      <span style={{ display: 'inline-flex', gap: '0.2rem', marginLeft: '0.5rem' }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <span
            key={n}
            style={{
              padding: '0.15rem 0.4rem',
              borderRadius: '0.2rem',
              backgroundColor: '#f3f4f6',
              fontSize: '0.7rem',
              color: '#374151',
            }}
          >
            {n}
          </span>
        ))}
      </span>
    )
  }

  return (
    <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: '#9ca3af' }}>
      (text{q.question_type_raw ? ` - raw: "${q.question_type_raw}"` : q.question_type ? ` - type: "${q.question_type}"` : ''})
    </span>
  )
}

export default function TemplatesPage() {
  const [data, setData] = useState({ templates: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => {
    fetch(`/api/templates?t=${Date.now()}`, { cache: 'no-store', credentials: 'include' })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}))
        if (!res.ok) {
          const msg = res.status === 503
            ? 'Airtable not configured'
            : (body.details || body.error || 'Failed to load templates')
          throw new Error(msg)
        }
        return body
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
          {error && !error.toLowerCase().includes('airtable not configured') && (
            <p style={{ margin: '0.75rem 0 0 0', fontSize: '0.875rem', color: '#991b1b' }}>
              Check: correct base ID, token has access to the base, and the base has tables named <strong>Templates</strong>, <strong>Template Sections</strong>, <strong>Template Questions</strong> (or set AIRTABLE_TEMPLATES_TABLE etc. in env).
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
            const displayName = (t.name || t.template_key || '').trim()
            const nameToShow = displayName && !displayName.startsWith('rec')
              ? displayName
              : `Template ${t.id?.slice(0, 12) || t.id}…`
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
                  <span>{nameToShow}</span>
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
                            <li key={q.id} style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
                              <span>{q.question_text}</span>
                              <QuestionPreview q={q} />
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                    <div style={{ marginTop: '1rem' }}>
                      <Link
                        href={`/inspections/new/template`}
                        style={{ color: '#3b82f6', fontSize: '0.875rem', textDecoration: 'none' }}
                      >
                        Complete template inspection →
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
          <Link href="/inspections/new/template" style={{ color: '#3b82f6', textDecoration: 'none' }}>
            Complete template inspection
          </Link>
          {' '}for formal scored inspections.
          {' '}
          <Link href="/templates/preview" style={{ color: '#3b82f6', textDecoration: 'none' }}>
            Preview QuestionCard (caretaker / NV)
          </Link>
        </p>
      )}
    </div>
  )
}
