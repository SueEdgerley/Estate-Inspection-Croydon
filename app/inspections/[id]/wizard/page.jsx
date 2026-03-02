'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  colours,
  yesColour,
  yesBg,
  noColour,
  noBg,
  naColour,
  naBg,
  issuePanelBg,
  issuePanelBorder,
  progressBg,
  progressComplete,
  minTapHeight,
} from '@/lib/nv-theme'

const OPTIONS = ['Yes', 'No', 'NA']

function normalizeVal(v) {
  if (v == null) return ''
  const s = String(v).trim().toLowerCase()
  if (s === 'yes') return 'Yes'
  if (s === 'no') return 'No'
  if (s === 'na') return 'NA'
  return ''
}

export default function InspectionWizardPage() {
  const params = useParams()
  const router = useRouter()
  const [id, setId] = useState(null)
  const [inspection, setInspection] = useState(null)
  const [template, setTemplate] = useState(null)
  const [sections, setSections] = useState([])
  const [flatSteps, setFlatSteps] = useState([])
  const [answers, setAnswers] = useState({})
  const [extras, setExtras] = useState({})
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [showJumpMenu, setShowJumpMenu] = useState(false)
  const [reviewOnlyIssues, setReviewOnlyIssues] = useState(false)

  useEffect(() => {
    const p = typeof params.id === 'string' ? params.id : params.id?.[0]
    if (p) setId(p)
  }, [params])

  useEffect(() => {
    if (!id) return
    let cancelled = false
    async function load() {
      try {
        const [inspRes, ansRes] = await Promise.all([
          fetch(`/api/inspections/${id}`, { credentials: 'include' }),
          fetch(`/api/inspections/${id}/answers`, { credentials: 'include' }),
        ])
        if (!inspRes.ok || inspRes.status === 404) {
          setError('Inspection not found')
          setLoading(false)
          return
        }
        const insp = await inspRes.json()
        if (insp.status !== 'draft') {
          setError('This inspection is no longer in draft. Use the main inspection view.')
          setLoading(false)
          return
        }
        if (!cancelled) setInspection(insp)

        let version = insp.template_version
        if (typeof version === 'string') {
          try {
            version = JSON.parse(version)
          } catch {
            version = null
          }
        }
        if (version && typeof version === 'object') {
          const secs = version.sections || []
          if (!cancelled) setTemplate(version)
          const steps = []
          secs.forEach((sec, si) => {
            (sec.questions || []).forEach((q, qi) => {
              steps.push({ type: 'question', sectionIndex: si, questionIndex: qi, section: sec, question: q })
            })
          })
          if (!cancelled) {
            setSections(secs)
            setFlatSteps(steps)
          }
        }

        if (ansRes.ok) {
          const ansList = await ansRes.json()
          const a = {}
          const e = {}
          ansList.forEach((row) => {
            const qId = row.question_id
            a[qId] = row.answer_value ?? row.answer_text ?? (row.answer_boolean == null ? null : row.answer_boolean ? 'Yes' : 'No')
            if (row.notes) e[qId] = { ...(e[qId] || {}), comment: row.notes }
          })
          if (!cancelled) {
            setAnswers((prev) => ({ ...prev, ...a }))
            setExtras((prev) => ({ ...prev, ...e }))
          }
        }
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Failed to load')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [id])

  const saveAnswer = useCallback(async (sectionId, questionId, value, comment) => {
    if (!id || !sectionId) return
    setSaving(true)
    try {
      const payload = { section_id: sectionId, answers: { [questionId]: value } }
      if (comment != null) payload.answers[`${questionId}_comment`] = comment
      const res = await fetch(`/api/inspections/${id}/answers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      })
      if (!res.ok) setError('Autosave failed')
    } catch {
      setError('Autosave failed')
    } finally {
      setSaving(false)
    }
  }, [id])

  const currentStepInfo = step >= 1 && step <= flatSteps.length ? flatSteps[step - 1] : null
  const isIntro = step === 0 && sections.length > 0
  const isReview = step === flatSteps.length + 1
  const totalQuestions = flatSteps.length
  const answeredCount = flatSteps.filter((s) => {
    const v = answers[s.question?.id]
    return v !== undefined && v !== null && String(v).trim() !== ''
  }).length

  const handleAnswer = (questionId, value, sectionId, comment) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }))
    const ext = extras[questionId] || {}
    if (comment !== undefined) setExtras((prev) => ({ ...prev, [questionId]: { ...ext, comment } }))
    saveAnswer(sectionId, questionId, value, comment !== undefined ? comment : ext.comment)
  }

  const handleExtras = (questionId, sectionId, updates) => {
    setExtras((prev) => {
      const next = { ...prev, [questionId]: { ...(prev[questionId] || {}), ...updates } }
      const comment = updates.comment !== undefined ? updates.comment : next[questionId]?.comment
      saveAnswer(sectionId, questionId, answers[questionId], comment)
      return next
    })
  }

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: colours.neutral.muted }}>
        Loading inspection…
      </div>
    )
  }
  if (error && !inspection) {
    return (
      <div style={{ padding: '2rem' }}>
        <Link href="/inspections" style={{ color: colours.primary, textDecoration: 'none', fontSize: '0.9375rem' }}>← Back to Inspections</Link>
        <div style={{ marginTop: '1rem', padding: '1rem', background: colours.errorLight, color: colours.error, borderRadius: 8 }}>{error}</div>
      </div>
    )
  }

  // Intro step (NV-style)
  if (isIntro) {
    return (
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '1.5rem 0' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <img src="/croydon-housing-logo.png" alt="Croydon Council" style={{ height: 48, width: 'auto', marginBottom: '1.5rem' }} />
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: colours.neutral.text, margin: '0 0 0.5rem' }}>Neighbourhood Voice Inspection</h1>
          <p style={{ fontSize: '1rem', color: colours.neutral.muted }}>Your feedback helps improve our estates.</p>
        </div>
        <div style={{ backgroundColor: colours.neutral.card, padding: '1.5rem', borderRadius: 8, border: `1px solid ${colours.neutral.border}`, marginBottom: '1.5rem' }}>
          <p style={{ margin: 0, fontSize: '0.9375rem', lineHeight: 1.6, color: colours.neutral.text }}>
            <strong>Time:</strong> About 10–15 minutes.
            <br />
            <strong>Safety:</strong> Only report what you can see safely. Do not put yourself at risk.
            <br />
            <strong>How we use this:</strong> Reports are used to prioritise repairs and cleaning. Your answers and photos help officers act quickly.
          </p>
        </div>
        <div style={{ position: 'sticky', bottom: 0, paddingTop: '1rem', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', backgroundColor: colours.neutral.bg }}>
          <Link href="/inspections" style={{ padding: '0.75rem 1.25rem', border: `1px solid ${colours.neutral.border}`, borderRadius: 8, color: colours.neutral.text, textDecoration: 'none', fontWeight: 500 }}>Cancel</Link>
          <button type="button" onClick={() => setStep(1)} style={{ padding: '0.75rem 1.5rem', backgroundColor: colours.primary, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>Start</button>
        </div>
      </div>
    )
  }

  // Review step
  if (isReview) {
    const issues = flatSteps.filter((s) => {
      const v = normalizeVal(answers[s.question?.id])
      const ext = extras[s.question?.id] || {}
      return v === 'No' || ext.raise_issue
    })
    const unanswered = flatSteps.filter((s) => {
      const v = answers[s.question?.id]
      return v === undefined || v === null || String(v).trim() === ''
    })

    return (
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '1.5rem 0' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: colours.neutral.text, marginBottom: '1rem' }}>Review and submit</h1>
        {issues.length > 0 && (
          <section style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, color: colours.neutral.text, marginBottom: '0.5rem' }}>Issues raised ({issues.length})</h2>
            <div style={{ backgroundColor: issuePanelBg, borderLeft: `4px solid ${issuePanelBorder}`, padding: '1rem', borderRadius: 8 }}>
              {issues.map((s) => (
                <div key={s.question?.id} style={{ marginBottom: '0.5rem', fontSize: '0.9375rem' }}>
                  <strong>{s.question?.resident_wording || s.question?.question_text}</strong>
                  {extras[s.question?.id]?.comment && <div style={{ color: colours.neutral.muted, marginTop: 2 }}>{extras[s.question?.id].comment}</div>}
                </div>
              ))}
            </div>
          </section>
        )}
        {unanswered.length > 0 && (
          <section style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, color: colours.warning, marginBottom: '0.5rem' }}>Unanswered ({unanswered.length})</h2>
            <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.9375rem', color: colours.neutral.muted }}>
              {unanswered.slice(0, 10).map((s) => (
                <li key={s.question?.id}>{s.question?.resident_wording || s.question?.question_text}</li>
              ))}
              {unanswered.length > 10 && <li>… and {unanswered.length - 10} more</li>}
            </ul>
          </section>
        )}
        <div style={{ position: 'sticky', bottom: 0, paddingTop: '1rem', display: 'flex', gap: '0.75rem', justifyContent: 'space-between', backgroundColor: colours.neutral.bg }}>
          <button type="button" onClick={() => setStep(flatSteps.length)} style={{ padding: '0.75rem 1.25rem', border: `1px solid ${colours.neutral.border}`, borderRadius: 8, background: colours.neutral.card, fontWeight: 500, cursor: 'pointer' }}>Back</button>
          <button
            type="button"
            onClick={async () => {
              setSaving(true)
              try {
                const res = await fetch(`/api/inspections/${id}/submit`, { method: 'POST', credentials: 'include' })
                if (res.ok) {
                  const data = await res.json().catch(() => ({}))
                  router.push(`/inspections/${data.inspectionId || id}`)
                } else {
                  const data = await res.json().catch(() => ({}))
                  setError(data?.error || 'Submit failed')
                }
              } catch (err) {
                setError(err?.message || 'Submit failed')
              } finally {
                setSaving(false)
              }
            }}
            disabled={saving}
            style={{ padding: '0.75rem 1.5rem', backgroundColor: colours.success, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}
          >
            {saving ? 'Submitting…' : 'Submit inspection'}
          </button>
        </div>
      </div>
    )
  }

  // Question step
  const s = currentStepInfo
  if (!s || s.type !== 'question') {
    return (
      <div style={{ padding: '2rem' }}>
        <Link href="/inspections" style={{ color: colours.primary, textDecoration: 'none' }}>← Back to Inspections</Link>
      </div>
    )
  }

  const sec = s.section
  const q = s.question
  const sectionNum = s.sectionIndex + 1
  const totalSections = sections.length
  const value = normalizeVal(answers[q.id])
  const ext = extras[q.id] || {}
  const isNo = value === 'No'
  const raiseIssue = ext.raise_issue || isNo

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '1.5rem 0', paddingBottom: 100 }}>
      {/* Progress */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', color: colours.neutral.muted', marginBottom: 4 }}>
          <span>Section {sectionNum} of {totalSections}</span>
          <span>{answeredCount} of {totalQuestions} answered</span>
        </div>
        <div style={{ height: 8, backgroundColor: colours.neutral.border, borderRadius: 999, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${totalQuestions ? (answeredCount / totalQuestions) * 100 : 0}%`, backgroundColor: answeredCount === totalQuestions ? progressComplete : progressBg, transition: 'width 0.2s' }} />
        </div>
      </div>

      {/* Section header */}
      <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: colours.primary, borderLeft: `4px solid ${colours.primary}`, paddingLeft: '0.75rem', marginBottom: '0.5rem' }}>
        {sec.title}
      </h2>
      {sec.help_text && <p style={{ fontSize: '0.875rem', color: colours.neutral.muted, marginBottom: '1rem' }}>{sec.help_text}</p>}

      {/* Question */}
      <div style={{ backgroundColor: colours.neutral.card, padding: '1.5rem', borderRadius: 8, border: `1px solid ${colours.neutral.border}`, marginBottom: '1rem' }}>
        <p style={{ fontSize: '1.0625rem', fontWeight: 500, color: colours.neutral.text, marginBottom: '0.5rem' }}>{q.resident_wording || q.question_text}</p>
        {q.helper_text && <p style={{ fontSize: '0.875rem', color: colours.neutral.muted, marginBottom: '1rem' }}>{q.helper_text}</p>}

        {/* Big Y/N/NA buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {OPTIONS.map((opt) => {
            const isSelected = value === opt
            const isYes = opt === 'Yes'
            const isNo = opt === 'No'
            const isNA = opt === 'NA'
            const bg = isSelected ? (isYes ? yesColour : isNo ? noColour : naColour) : colours.neutral.card
            const border = isSelected ? 'transparent' : colours.neutral.border
            const color = isSelected ? '#fff' : colours.neutral.text
            return (
              <button
                key={opt}
                type="button"
                onClick={() => handleAnswer(q.id, opt, sec.id)}
                style={{
                  minHeight: minTapHeight,
                  padding: '0.75rem 1rem',
                  fontSize: '1.125rem',
                  fontWeight: 600,
                  backgroundColor: bg,
                  color,
                  border: `2px solid ${border}`,
                  borderRadius: 8,
                  cursor: 'pointer',
                  textAlign: 'center',
                }}
              >
                {opt}
              </button>
            )
          })}
        </div>

        {/* Raise issue anyway (when Y) */}
        {value === 'Yes' && (
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1rem', fontSize: '0.9375rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={!!ext.raise_issue} onChange={(e) => handleExtras(q.id, sec.id, { raise_issue: e.target.checked })} />
            Raise an issue anyway (e.g. still a concern)
          </label>
        )}

        {/* Issue panel */}
        {raiseIssue && (
          <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: issuePanelBg, borderLeft: `4px solid ${issuePanelBorder}`, borderRadius: 8 }}>
            <p style={{ fontWeight: 600, marginBottom: '0.5rem', fontSize: '0.9375rem' }}>Add details</p>
            <textarea
              placeholder="e.g. Please ensure the area is kept clear."
              value={ext.comment || ''}
              onChange={(e) => handleExtras(q.id, sec.id, { comment: e.target.value })}
              rows={2}
              style={{ width: '100%', padding: '0.5rem', border: `1px solid ${colours.neutral.border}`, borderRadius: 6, fontSize: '0.9375rem', marginBottom: '0.5rem' }}
            />
            <div style={{ fontSize: '0.8125rem', color: colours.neutral.muted }}>Photo upload can be added here.</div>
            <select
              value={ext.severity || ''}
              onChange={(e) => handleExtras(q.id, sec.id, { severity: e.target.value })}
              style={{ marginTop: '0.5rem', padding: '0.5rem', border: `1px solid ${colours.neutral.border}`, borderRadius: 6, fontSize: '0.875rem' }}
            >
              <option value="">Severity (optional)</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
        )}
      </div>

      {saving && <p style={{ fontSize: '0.8125rem', color: colours.neutral.muted }}>Saving…</p>}

      {/* Sticky Next / Back */}
      <div style={{ position: 'sticky', bottom: 0, left: 0, right: 0, padding: '1rem 0', backgroundColor: colours.neutral.bg, borderTop: `1px solid ${colours.neutral.border}`, display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
        <button type="button" onClick={() => setStep((prev) => Math.max(0, prev - 1))} style={{ padding: '0.75rem 1.25rem', minHeight: minTapHeight, border: `1px solid ${colours.neutral.border}`, borderRadius: 8, background: colours.neutral.card, fontWeight: 500, cursor: 'pointer' }}>Back</button>
        <button type="button" onClick={() => setStep((prev) => (prev >= flatSteps.length + 1 ? prev : prev + 1))} style={{ padding: '0.75rem 1.5rem', minHeight: minTapHeight, backgroundColor: colours.primary, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>{step === flatSteps.length ? 'Review' : 'Next'}</button>
      </div>
    </div>
  )
}
