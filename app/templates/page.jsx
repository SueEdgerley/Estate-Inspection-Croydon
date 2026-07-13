'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { isTemplateAdminViewer } from '@/lib/template-visibility'
import { photobook } from '@/lib/photobook-theme'
import { getGradePreviewChipStyle } from '@/lib/grading-button-styles'
import { NO_FORMS_FOR_ROLE_MESSAGE } from '@/lib/inspection-permission-messages'

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
  if (q == null || typeof q !== 'object') {
    return <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: '#9ca3af' }}>(invalid question)</span>
  }
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
          <span key={opt} style={getGradePreviewChipStyle(opt)}>
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

export default function FormsPage() {
  const [data, setData] = useState({ templates: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  const [viewer, setViewer] = useState({
    normalizedRole: null,
    clerkIsAdmin: false,
    accessMessage: null,
    jobTitle: null,
  })

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch(`/api/templates?t=${Date.now()}`, { cache: 'no-store', credentials: 'include' }).then(async (res) => {
        const body = await res.json().catch(() => ({}))
        if (!res.ok) {
          console.warn('[Forms] GET /api/templates failed', {
            status: res.status,
            error: body?.error,
            details: body?.details,
            source: body?.source,
          })
          throw new Error('Forms could not be loaded. Please try again or contact support.')
        }
        if (body?.warning) {
          console.warn('[Forms] GET /api/templates warning', body.warning)
        }
        if (body?.source === 'template_versions_fallback') {
          console.info('[Forms] templates loaded from Postgres fallback', {
            count: Array.isArray(body.templates) ? body.templates.length : 0,
          })
        }
        return body
      }),
      fetch('/api/auth/me', { cache: 'no-store', credentials: 'include' })
        .then((r) => (r.ok ? r.json() : {}))
        .catch(() => ({})),
    ])
      .then(([d, me]) => {
        if (cancelled) return
        const base = d && typeof d === 'object' && !Array.isArray(d) ? { ...d } : { templates: [] }
        setData({
          ...base,
          templates: Array.isArray(base.templates) ? base.templates : [],
        })
        setViewer({
          normalizedRole: me?.roleUi?.normalizedRole || null,
          clerkIsAdmin: me?.clerkIsAdmin === true,
          accessMessage: me?.roleUi?.accessMessage || null,
          jobTitle: me?.jobTitle || me?.roleUi?.jobTitle || null,
        })
      })
      .catch((err) => {
        if (!cancelled) {
          if (process.env.NODE_ENV === 'development') {
            console.warn('[Forms] load failed', err)
          }
          setError('Forms could not be loaded. Please try again or contact support.')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const isAdminViewer = useMemo(
    () => isTemplateAdminViewer({ appRole: viewer.normalizedRole, clerkIsAdmin: viewer.clerkIsAdmin }),
    [viewer.normalizedRole, viewer.clerkIsAdmin]
  )

  const templates = Array.isArray(data?.templates) ? data.templates : []
  const errText = error == null ? '' : String(error)

  return (
    <div>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 'bold', color: '#111827' }}>
          Forms
        </h1>
        <p style={{ margin: '0.5rem 0 0 0', color: '#6b7280', lineHeight: 1.5 }}>
          Tap a form to start a new inspection — no second step.
          {viewer.normalizedRole === 'caretaker' ? (
            <span style={{ display: 'block', marginTop: '0.5rem' }}>
              <Link href="/caretaker/my-inspections" style={{ color: photobook.link, fontWeight: 600, textDecoration: 'none' }}>
                My submitted inspections & follow-up notes →
              </Link>
            </span>
          ) : null}
          {isAdminViewer && (
            <span style={{ display: 'block', marginTop: '0.35rem', fontSize: '0.875rem' }}>
              Admins can open <strong>Structure</strong> to preview questions without starting.
            </span>
          )}
        </p>
      </div>

      {loading && (
        <p style={{ color: '#6b7280' }}>Loading forms…</p>
      )}

      {errText && (
        <div style={{
          padding: '1rem',
          backgroundColor: '#fee2e2',
          color: '#dc2626',
          borderRadius: '0.5rem',
          marginBottom: '1rem',
        }}>
          <p style={{ margin: 0, fontWeight: 500 }}>{errText}</p>
        </div>
      )}

      {!loading && !errText && templates.length === 0 && (
        <div style={{
          backgroundColor: 'white',
          padding: '2rem',
          borderRadius: '0.5rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          border: '1px solid #fde68a',
          backgroundImage: 'linear-gradient(180deg, #fffbeb 0%, #ffffff 48%)',
          color: '#92400e',
          textAlign: 'left',
        }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: '1.0625rem', color: '#78350f' }}>
            No forms available for your account
          </p>
          <p style={{ margin: '0.75rem 0 0', lineHeight: 1.55, color: '#92400e' }}>
            {viewer.accessMessage || NO_FORMS_FOR_ROLE_MESSAGE}
          </p>
          <p style={{ margin: '0.75rem 0 0', lineHeight: 1.55, fontSize: '0.9375rem', color: '#a16207' }}>
            Do not start filling an inspection until your role is set — otherwise your work may not be saved.
          </p>
        </div>
      )}

      {!loading && !errText && templates.length > 0 && (
        <div style={{
          backgroundColor: 'white',
          borderRadius: '0.5rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          overflow: 'hidden',
        }}>
          {templates.map((t) => {
            const isExpanded = isAdminViewer && expandedId === t.id
            const sectionCount = (t.sections || []).length
            const questionCount = (t.sections || []).reduce((n, s) => n + (s.questions || []).length, 0)
            const displayName = (t.name || t.template_key || '').trim()
            const nameToShow = displayName && !displayName.startsWith('rec')
              ? displayName
              : `Form ${t.id?.slice(0, 12) || t.id}…`
            const startHref = `/inspections/new?template_id=${encodeURIComponent(t.id)}`

            return (
              <div
                key={t.id}
                style={{
                  borderBottom: '1px solid #e5e7eb',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'stretch',
                    flexWrap: 'wrap',
                    gap: 0,
                  }}
                >
                  <Link
                    href={startHref}
                    style={{
                      flex: '1 1 220px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '1rem',
                      padding: '1.25rem 1.25rem',
                      minHeight: 72,
                      textDecoration: 'none',
                      color: '#111827',
                      backgroundColor: isExpanded ? '#faf5ff' : 'transparent',
                      touchAction: 'manipulation',
                      WebkitTapHighlightColor: 'transparent',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '1.0625rem', lineHeight: 1.3 }}>
                        {nameToShow}
                      </div>
                      <div style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.35rem' }}>
                        {sectionCount} section{sectionCount !== 1 ? 's' : ''} · {questionCount} question{questionCount !== 1 ? 's' : ''}
                      </div>
                      <div style={{ fontSize: '0.8125rem', color: photobook.primary, fontWeight: 600, marginTop: '0.5rem' }}>
                        Start inspection →
                      </div>
                    </div>
                    <span
                      aria-hidden
                      style={{
                        flexShrink: 0,
                        color: photobook.primary,
                        fontWeight: 700,
                        fontSize: '1.5rem',
                        lineHeight: 1,
                      }}
                    >
                      →
                    </span>
                  </Link>
                  {isAdminViewer && (
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : t.id)}
                      style={{
                        flex: '0 0 auto',
                        alignSelf: 'stretch',
                        padding: '0 1rem',
                        minHeight: 72,
                        minWidth: 96,
                        border: 'none',
                        borderLeft: '1px solid #e5e7eb',
                        backgroundColor: '#f9fafb',
                        color: '#374151',
                        fontSize: '0.8125rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        touchAction: 'manipulation',
                      }}
                    >
                      {isExpanded ? 'Hide' : 'Structure'}
                    </button>
                  )}
                </div>
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
                          {(sec.questions || []).map((q, qi) => (
                            <li
                              key={q && q.id != null ? String(q.id) : `q-${String(sec.id)}-${qi}`}
                              style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}
                            >
                              <span>{q?.question_text != null ? q.question_text : '—'}</span>
                              <QuestionPreview q={q} />
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {!loading && templates.length > 0 && (
        <p style={{ marginTop: '1.25rem', fontSize: '0.875rem', color: '#6b7280' }}>
          <Link href="/inspections/new" style={{ color: photobook.link, textDecoration: 'none', fontWeight: 500 }}>
            New inspection without a preset form
          </Link>
          {isAdminViewer && (
            <>
              {' · '}
              <Link href="/templates/preview" style={{ color: photobook.link, textDecoration: 'none', fontWeight: 500 }}>
                QuestionCard preview (caretaker / NV)
              </Link>
            </>
          )}
        </p>
      )}
    </div>
  )
}
