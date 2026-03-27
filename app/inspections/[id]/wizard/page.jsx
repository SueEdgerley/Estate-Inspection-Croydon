'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import WizardQuestionFields from '../../../components/wizard/WizardQuestionFields'

// NV design system (wizard only): calm, modern, resident-friendly
const MAX_PHOTOS_PER_QUESTION = 3

const MOBILE_BREAKPOINT = 768
const nv = {
  font: 'var(--font-geist-sans), Inter, system-ui, sans-serif',
  baseSize: 16,
  lineHeight: 1.5,
  sectionTitleSize: '20px',
  questionSize: '17px',
  helperSize: '14px',
  helperColor: '#6B7280',
  metaSize: '13px',
  pagePadMobile: 16,
  pagePadDesktop: 24,
  cardPad: 16,
  spaceCards: 24,
  spaceQuestionAnswers: 12,
  spaceSections: 24,
  bg: '#F9FAFB',
  cardBg: '#FFFFFF',
  cardRadius: 12,
  cardShadow: '0 1px 3px rgba(0,0,0,0.08)',
  cardBorder: '1px solid #E5E7EB',
  btnMinHeight: 48,
  btnMinHeightMobile: 56,
  btnRadius: 10,
  btnFontWeight: 600,
  btnPx: 16,
  yesColor: '#16A34A',
  noColor: '#DC2626',
  naColor: '#6B7280',
  btnUnselectedBorder: '1px solid #D1D5DB',
  transition: '150ms ease',
  progressHeight: 6,
  progressTrack: '#E5E7EB',
  progressFill: '#1E3A8A',
  issueBg: '#FEE2E2',
  issueBorder: '4px solid #DC2626',
  issuePad: '12px 16px',
  issueRadius: 8,
  sectionAccent: '4px solid #1E3A8A',
  primary: '#1E3A8A',
  stickyBarBg: '#FFFFFF',
  stickyBarBorder: '1px solid #E5E7EB',
  stickyPad: '12px 16px',
  unansweredAmber: '#FEF3C7',
  text: '#111827',
  muted: '#6B7280',
  errorLight: '#FEE2E2',
  error: '#DC2626',
  success: '#16A34A',
  primaryLight: '#EFF6FF',
}

function normalizeVal(v) {
  if (v == null) return ''
  const s = String(v).trim().toLowerCase()
  if (s === 'yes') return 'Yes'
  if (s === 'no') return 'No'
  if (s === 'na') return 'NA'
  return ''
}

function getSectionIcon(title) {
  if (!title) return '📋'
  const t = String(title).toLowerCase()
  if (t.includes('clean')) return '🧹'
  if (t.includes('repair') || t.includes('mainten')) return '🔧'
  if (t.includes('fire') || t.includes('safety')) return '🔥'
  if (t.includes('light')) return '💡'
  if (t.includes('bin') || t.includes('waste')) return '🗑️'
  if (t.includes('ground') || t.includes('external')) return '🏘️'
  return '📋'
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
  const [reviewConfirmed, setReviewConfirmed] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [questionStep, setQuestionStep] = useState(0)
  const commentFocusRef = useRef(null)
  const focusedNoForQuestionId = useRef(null)

  useEffect(() => {
    const p = typeof params.id === 'string' ? params.id : params.id?.[0]
    if (p) setId(p)
  }, [params])

  useEffect(() => {
    const mq = typeof window !== 'undefined' && window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`)
    if (!mq) return
    const onChange = () => setIsMobile(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

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

  const saveCurrentSection = useCallback(async () => {
    if (step < 1 || step > sections.length || !id) return
    const sec = sections[step - 1]
    if (!sec?.questions?.length) return
    setSaving(true)
    try {
      const ans = {}
      sec.questions.forEach((q) => {
        const v = answers[q.id]
        if (v !== undefined && v !== null) ans[q.id] = v
        const comment = extras[q.id]?.comment
        if (comment != null) ans[`${q.id}_comment`] = comment
      })
      const res = await fetch(`/api/inspections/${id}/answers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ section_id: sec.id, answers: ans }),
      })
      if (!res.ok) setError('Save failed')
    } catch {
      setError('Save failed')
    } finally {
      setSaving(false)
    }
  }, [id, step, sections, answers, extras])

  const saveSection = useCallback(async (sec) => {
    if (!id || !sec?.questions?.length) return
    setSaving(true)
    try {
      const ans = {}
      sec.questions.forEach((q) => {
        const v = answers[q.id]
        if (v !== undefined && v !== null) ans[q.id] = v
        const comment = extras[q.id]?.comment
        if (comment != null) ans[`${q.id}_comment`] = comment
      })
      const res = await fetch(`/api/inspections/${id}/answers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ section_id: sec.id, answers: ans }),
      })
      if (!res.ok) setError('Save failed')
    } catch {
      setError('Save failed')
    } finally {
      setSaving(false)
    }
  }, [id, answers, extras])

  const totalQuestions = flatSteps.length
  const answeredCount = flatSteps.filter((s) => {
    const v = answers[s.question?.id]
    return v !== undefined && v !== null && String(v).trim() !== ''
  }).length
  const isIntro = (isMobile && questionStep === 0) || (!isMobile && step === 0)
  const isReview = (isMobile && questionStep === flatSteps.length + 1) || (!isMobile && step === sections.length + 1)
  const currentSectionIndex = step >= 1 && step <= sections.length ? step - 1 : -1
  const currentSection = currentSectionIndex >= 0 ? sections[currentSectionIndex] : null
  const progressPct = totalQuestions ? Math.round((answeredCount / totalQuestions) * 100) : 0
  const currentFlatStep = isMobile && questionStep >= 1 && questionStep <= flatSteps.length ? flatSteps[questionStep - 1] : null
  const currentQuestion = currentFlatStep?.question
  const currentSectionForQuestion = currentFlatStep?.section
  const sectionNumForQuestion = currentFlatStep ? currentFlatStep.sectionIndex + 1 : 0
  const questionNumInSection = currentFlatStep ? currentFlatStep.questionIndex + 1 : 0
  const totalInSection = currentSectionForQuestion?.questions?.length ?? 0

  const handleAnswer = (questionId, value, sectionId, comment) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }))
    const ext = extras[questionId] || {}
    if (comment !== undefined) setExtras((prev) => ({ ...prev, [questionId]: { ...ext, comment } }))
    saveAnswer(sectionId, questionId, value, comment !== undefined ? comment : ext.comment)
  }

  const handleExtras = (questionId, sectionId, updates) => {
    setExtras((prev) => {
      const next = { ...prev, [questionId]: { ...(prev[questionId] || {}), ...updates } }
      if (updates.photo_urls && Array.isArray(updates.photo_urls) && updates.photo_urls.length > MAX_PHOTOS_PER_QUESTION) {
        next[questionId].photo_urls = updates.photo_urls.slice(0, MAX_PHOTOS_PER_QUESTION)
      }
      const comment = updates.comment !== undefined ? updates.comment : next[questionId]?.comment
      saveAnswer(sectionId, questionId, answers[questionId], comment)
      return next
    })
  }

  if (loading) {
    return (
      <div className="nv-wizard-page" style={{ minHeight: '100vh', backgroundColor: nv.bg, textAlign: 'center', color: nv.muted, fontFamily: nv.font, fontSize: nv.baseSize, lineHeight: nv.lineHeight }}>
        Loading inspection…
      </div>
    )
  }
  if (error && !inspection) {
    return (
      <div className="nv-wizard-page" style={{ minHeight: '100vh', backgroundColor: nv.bg, fontFamily: nv.font, fontSize: nv.baseSize }}>
        <Link href="/inspections" style={{ color: nv.primary, textDecoration: 'none', fontSize: nv.metaSize }}>← Back to Inspections</Link>
        <div style={{ marginTop: 16, padding: 16, background: nv.errorLight, color: nv.error, borderRadius: nv.issueRadius }}>{error}</div>
      </div>
    )
  }

  // Intro: Croydon logo, 24px title, short description, primary "Start Inspection"
  if (isIntro) {
    return (
      <div className="nv-wizard-page" style={{ minHeight: '100vh', backgroundColor: nv.bg, paddingBottom: '6rem', fontFamily: nv.font, fontSize: nv.baseSize, lineHeight: nv.lineHeight }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                backgroundColor: '#fff',
                borderRadius: 8,
                padding: '8px 14px',
                lineHeight: 0,
                marginBottom: 16,
              }}
            >
              <img
                src="/croydon-housing-logo.svg"
                alt="Croydon Council"
                style={{ height: 48, width: 'auto', maxWidth: '100%', objectFit: 'contain' }}
              />
            </span>
            <h1 style={{ fontSize: '24px', fontWeight: 600, color: nv.text, margin: '0 0 8px' }}>Neighbourhood Voice Inspection</h1>
            <p style={{ fontSize: nv.baseSize, color: nv.muted }}>Your feedback helps improve our estates.</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm mb-4">
            <h2 style={{ fontSize: nv.sectionTitleSize, fontWeight: 600, color: nv.text, marginBottom: 12 }}>What this inspection is for</h2>
            <p style={{ margin: 0, fontSize: nv.baseSize, lineHeight: nv.lineHeight, color: nv.text, marginBottom: 16 }}>
              We want to hear from you about the condition of your estate. Your answers help us prioritise repairs, cleaning and safety.
            </p>
            <h2 style={{ fontSize: nv.sectionTitleSize, fontWeight: 600, color: nv.text, marginBottom: 12 }}>Approximate time</h2>
            <p style={{ margin: 0, fontSize: nv.baseSize, lineHeight: nv.lineHeight, color: nv.text, marginBottom: 16 }}>
              About 10–15 minutes. You can save and come back later.
            </p>
            <h2 style={{ fontSize: nv.sectionTitleSize, fontWeight: 600, color: nv.text, marginBottom: 12 }}>Safety</h2>
            <p style={{ margin: 0, fontSize: nv.baseSize, lineHeight: nv.lineHeight, color: nv.text, marginBottom: 16 }}>
              Only report what you can see safely. Do not put yourself at risk. If something is dangerous, report it through the usual channels.
            </p>
            <h2 style={{ fontSize: nv.sectionTitleSize, fontWeight: 600, color: nv.text, marginBottom: 12 }}>How we use your report</h2>
            <p style={{ margin: 0, fontSize: nv.baseSize, lineHeight: nv.lineHeight, color: nv.text }}>
              Your answers and photos are used to create tasks for officers and to prioritise repairs and cleaning. Your input helps us act quickly.
            </p>
          </div>
          <div style={{ position: 'sticky', bottom: 0, paddingTop: 16, display: 'flex', gap: 12, justifyContent: 'flex-end', backgroundColor: nv.bg }}>
            <Link href="/inspections" style={{ padding: `12px ${nv.btnPx}px`, minHeight: nv.btnMinHeight, border: nv.btnUnselectedBorder, borderRadius: nv.btnRadius, color: nv.text, textDecoration: 'none', fontWeight: 500, display: 'inline-flex', alignItems: 'center', backgroundColor: nv.cardBg }}>Cancel</Link>
            <button type="button" onClick={() => { setStep(1); setQuestionStep(1) }} style={{ padding: `12px ${nv.btnPx}px`, minHeight: nv.btnMinHeight, backgroundColor: nv.primary, color: '#fff', border: 'none', borderRadius: nv.btnRadius, fontWeight: nv.btnFontWeight, cursor: 'pointer', transition: nv.transition }}>Start Inspection</button>
          </div>
        </div>
      </div>
    )
  }

  // Review step: Issues first, then Unanswered, then Completed (collapsed), confirm before submit
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
    const completedSections = sections.map((sec, idx) => ({
      section: sec,
      index: idx,
      questions: (sec.questions || []).filter((q) => {
        const v = answers[q.id]
        return v !== undefined && v !== null && String(v).trim() !== ''
      }),
    })).filter((c) => c.questions.length > 0)

    return (
      <div className="nv-wizard-page" style={{ minHeight: '100vh', backgroundColor: nv.bg, paddingBottom: '7rem', fontFamily: nv.font, fontSize: nv.baseSize, lineHeight: nv.lineHeight }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <h1 style={{ fontSize: nv.sectionTitleSize, fontWeight: 600, color: nv.text, marginBottom: 16 }}>Review and submit</h1>

          {issues.length > 0 && (
            <section style={{ marginBottom: nv.spaceSections }}>
              <h2 style={{ fontSize: nv.questionSize, fontWeight: 600, color: nv.text, marginBottom: 8 }}>Issues raised ({issues.length})</h2>
              <div style={{ backgroundColor: nv.issueBg, borderLeft: nv.issueBorder, padding: nv.issuePad, borderRadius: nv.issueRadius, boxShadow: nv.cardShadow }}>
                {issues.map((s) => (
                  <div key={s.question?.id} style={{ marginBottom: 12, fontSize: nv.baseSize }}>
                    <span style={{ display: 'inline-block', marginBottom: 4, padding: '2px 8px', fontSize: nv.metaSize, fontWeight: 600, backgroundColor: nv.error, color: '#fff', borderRadius: 999 }}>Issue raised</span>
                    <p style={{ margin: '4px 0 0', fontWeight: 500 }}>{s.question?.resident_wording || s.question?.question_text}</p>
                    {extras[s.question?.id]?.comment && <div style={{ color: nv.muted, marginTop: 4, fontSize: nv.helperSize }}>{extras[s.question?.id].comment}</div>}
                    {extras[s.question?.id]?.severity && <div style={{ color: nv.muted, marginTop: 2, fontSize: nv.metaSize }}>Severity: {extras[s.question?.id].severity}</div>}
                  </div>
                ))}
              </div>
            </section>
          )}

          {unanswered.length > 0 && (
            <section style={{ marginBottom: nv.spaceSections }}>
              <h2 style={{ fontSize: nv.questionSize, fontWeight: 600, color: nv.text, marginBottom: 8 }}>Unanswered ({unanswered.length})</h2>
              <div className="rounded-xl border border-slate-200 bg-amber-50 p-4 shadow-sm border-amber-200">
                <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: nv.helperSize, color: nv.muted }}>
                  {unanswered.slice(0, 10).map((s) => (
                    <li key={s.question?.id}>{s.question?.resident_wording || s.question?.question_text}</li>
                  ))}
                  {unanswered.length > 10 && <li>… and {unanswered.length - 10} more</li>}
                </ul>
              </div>
            </section>
          )}

          {completedSections.length > 0 && (
            <section style={{ marginBottom: nv.spaceSections }}>
              <h2 style={{ fontSize: nv.questionSize, fontWeight: 600, color: nv.muted, marginBottom: 8 }}>Completed sections</h2>
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                {completedSections.map((c) => (
                  <details key={c.section.id} style={{ marginBottom: 4 }}>
                    <summary style={{ fontSize: nv.baseSize, cursor: 'pointer', color: nv.text }}>{getSectionIcon(c.section.title)} {c.section.title} ({c.questions.length} answered)</summary>
                    <ul style={{ margin: '8px 0 0 1rem', paddingLeft: '1rem', fontSize: nv.helperSize, color: nv.muted }}>
                      {c.questions.map((q) => (
                        <li key={q.id}>{q.resident_wording || q.question_text}: {normalizeVal(answers[q.id]) || answers[q.id]}</li>
                      ))}
                    </ul>
                  </details>
                ))}
              </div>
            </section>
          )}

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: nv.baseSize, cursor: 'pointer' }}>
              <input type="checkbox" id="review-confirm" checked={reviewConfirmed} onChange={(e) => setReviewConfirmed(e.target.checked)} style={{ minWidth: 20, minHeight: 20 }} />
              <span>I have reviewed my answers and want to submit this inspection.</span>
            </label>
          </div>

          <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: nv.stickyPad, backgroundColor: nv.stickyBarBg, borderTop: nv.stickyBarBorder, display: 'flex', gap: 12, justifyContent: 'space-between', maxWidth: 640, margin: '0 auto' }}>
            <button type="button" onClick={() => { if (isMobile) setQuestionStep(flatSteps.length); else setStep(sections.length) }} style={{ padding: `12px ${nv.btnPx}px`, minHeight: nv.btnMinHeight, border: nv.btnUnselectedBorder, borderRadius: nv.btnRadius, background: nv.cardBg, fontWeight: 500, cursor: 'pointer', fontSize: nv.baseSize }}>Back</button>
            <button
              type="button"
              disabled={saving || !reviewConfirmed}
              onClick={async () => {
                if (!reviewConfirmed) return
                setSaving(true)
                try {
                  const res = await fetch(`/api/inspections/${id}/submit`, { method: 'POST', credentials: 'include' })
                  if (res.ok) {
                    await res.json().catch(() => ({}))
                    router.push('/dashboard')
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
              style={{ padding: `12px ${nv.btnPx}px`, minHeight: nv.btnMinHeight, backgroundColor: reviewConfirmed && !saving ? nv.success : '#9CA3AF', color: '#fff', border: 'none', borderRadius: nv.btnRadius, fontWeight: nv.btnFontWeight, cursor: reviewConfirmed && !saving ? 'pointer' : 'not-allowed', fontSize: nv.baseSize, transition: nv.transition }}
            >
              {saving ? 'Submitting…' : 'Submit inspection'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Mobile: one question at a time with progress line, big tap buttons, sticky bar, collapsible guidance
  if (isMobile && currentFlatStep && currentQuestion && currentSectionForQuestion) {
    const sec = currentSectionForQuestion
    const q = currentQuestion
    const value = normalizeVal(answers[q.id])
    const isNo = value === 'No'

    if (isNo && focusedNoForQuestionId.current !== q.id && commentFocusRef.current) {
      focusedNoForQuestionId.current = q.id
      setTimeout(() => commentFocusRef.current?.focus(), 100)
    } else if (!isNo) focusedNoForQuestionId.current = null

    return (
      <div className="nv-wizard-page" style={{ minHeight: '100vh', backgroundColor: nv.bg, paddingBottom: '6rem', fontFamily: nv.font, fontSize: nv.baseSize, lineHeight: nv.lineHeight }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <p style={{ fontSize: nv.metaSize, color: nv.muted, marginBottom: 12 }}>
            Section {sectionNumForQuestion} of {sections.length} · Question {questionNumInSection} of {totalInSection}
          </p>

          <h2 style={{ fontSize: '1rem', fontWeight: 600, color: nv.text, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>{getSectionIcon(sec.title)}</span>
            {sec.title}
          </h2>

          {(sec.help_text || sec.what_to_look_for) && (
            <details style={{ marginBottom: 16 }}>
              <summary style={{ fontSize: 13, color: nv.muted, cursor: 'pointer', padding: '8px 0' }}>
                What to look for
              </summary>
              <p style={{ margin: 0, fontSize: 13, color: nv.muted, padding: '8px 12px', backgroundColor: nv.primaryLight, borderRadius: 8 }}>
                {sec.what_to_look_for || sec.help_text}
              </p>
            </details>
          )}

          <div style={{ backgroundColor: nv.cardBg, padding: nv.cardPad, borderRadius: nv.cardRadius, border: nv.cardBorder, boxShadow: nv.cardShadow, marginBottom: nv.spaceCards }}>
            {(q.category || q.action_category) && (
              <span
                style={{
                  display: 'inline-block',
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#6B7280',
                  backgroundColor: '#F3F4F6',
                  padding: '4px 10px',
                  borderRadius: 999,
                  marginBottom: 10,
                }}
              >
                {q.category || q.action_category}
              </span>
            )}
            <p style={{ fontSize: nv.questionSize, fontWeight: 500, color: nv.text, marginBottom: nv.spaceQuestionAnswers }}>{q.resident_wording || q.question_text}</p>
            {q.helper_text && <p style={{ fontSize: nv.helperSize, color: nv.helperColor, marginBottom: 16 }}>{q.helper_text}</p>}

            <WizardQuestionFields
              q={q}
              sec={sec}
              nv={nv}
              answers={answers}
              extras={extras}
              handleAnswer={handleAnswer}
              handleExtras={handleExtras}
              maxPhotos={MAX_PHOTOS_PER_QUESTION}
              commentFocusRef={commentFocusRef}
              isMobile
            />
          </div>

          {saving && <p style={{ fontSize: nv.metaSize, color: nv.muted, marginTop: 8 }}>Saving…</p>}

          <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: nv.stickyPad, backgroundColor: nv.stickyBarBg, borderTop: nv.stickyBarBorder, display: 'flex', gap: 8, maxWidth: 560, margin: '0 auto' }}>
            <button type="button" onClick={() => setQuestionStep((prev) => Math.max(0, prev - 1))} style={{ padding: `12px ${nv.btnPx}px`, minHeight: nv.btnMinHeightMobile, border: nv.btnUnselectedBorder, borderRadius: nv.btnRadius, background: nv.cardBg, fontWeight: 500, cursor: 'pointer', fontSize: nv.baseSize }}>Previous</button>
            <button type="button" onClick={() => saveSection(sec)} disabled={saving} style={{ padding: `12px ${nv.btnPx}px`, minHeight: nv.btnMinHeightMobile, border: nv.btnUnselectedBorder, borderRadius: nv.btnRadius, background: nv.cardBg, fontWeight: 500, cursor: saving ? 'not-allowed' : 'pointer', fontSize: nv.baseSize }}>{saving ? 'Saving…' : 'Save draft'}</button>
            <button type="button" onClick={() => setQuestionStep((prev) => (prev >= flatSteps.length + 1 ? prev : prev + 1))} style={{ padding: `12px ${nv.btnPx}px`, minHeight: nv.btnMinHeightMobile, backgroundColor: nv.primary, color: '#fff', border: 'none', borderRadius: nv.btnRadius, fontWeight: nv.btnFontWeight, cursor: 'pointer', fontSize: nv.baseSize }}>{questionStep === flatSteps.length ? 'Review' : 'Next'}</button>
          </div>
        </div>
      </div>
    )
  }

  // Section step: one section at a time, all questions in section as cards (desktop)
  if (!currentSection || currentSectionIndex < 0) {
    return (
      <div className="nv-wizard-page" style={{ backgroundColor: nv.bg, fontFamily: nv.font }}>
        <Link href="/inspections" style={{ color: nv.primary, textDecoration: 'none', fontSize: nv.baseSize }}>← Back to Inspections</Link>
      </div>
    )
  }

  const sec = currentSection
  const sectionNum = currentSectionIndex + 1
  const totalSections = sections.length
  const sectionQuestions = sec.questions || []

  return (
    <div className="nv-wizard-page" style={{ minHeight: '100vh', backgroundColor: nv.bg, paddingBottom: '5.5rem', fontFamily: nv.font, fontSize: nv.baseSize, lineHeight: nv.lineHeight }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        {/* Progress: Section X of Y + percentage; bar 6px, track #E5E7EB, fill #1E3A8A */}
        <div style={{ marginBottom: nv.spaceSections }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: nv.metaSize, color: nv.muted, marginBottom: 4 }}>
            <span>Section {sectionNum} of {totalSections}</span>
            <span>{progressPct}% complete</span>
          </div>
          <div style={{ height: nv.progressHeight, backgroundColor: nv.progressTrack, borderRadius: 999, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${progressPct}%`, backgroundColor: nv.progressFill, borderRadius: 999, transition: nv.transition }} />
          </div>
        </div>

        {/* Section header: 20px semibold, 4px left accent, optional icon */}
        <div style={{ marginBottom: nv.spaceSections }}>
          <h2 style={{ fontSize: nv.sectionTitleSize, fontWeight: 600, color: nv.text, borderLeft: nv.sectionAccent, paddingLeft: 12, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>{getSectionIcon(sec.title)}</span>
            {sec.title}
          </h2>
          {(sec.help_text || sec.what_to_look_for) && (
            <p style={{ fontSize: nv.helperSize, color: nv.muted, margin: 0, padding: '12px 16px', backgroundColor: nv.primaryLight, borderRadius: 8 }}>
              <strong>What to look for:</strong> {sec.what_to_look_for || sec.help_text}
            </p>
          )}
        </div>

        {/* Questions: white cards, 16px padding, 16px between cards; question 16-18px medium, helper 14px muted; space question–answers 12px */}
        {sectionQuestions.map((q) => (
          <div key={q.id} style={{ backgroundColor: nv.cardBg, padding: nv.cardPad, borderRadius: nv.cardRadius, border: nv.cardBorder, boxShadow: nv.cardShadow, marginBottom: nv.spaceCards }}>
            <p style={{ fontSize: nv.questionSize, fontWeight: 500, color: nv.text, marginBottom: nv.spaceQuestionAnswers }}>{q.resident_wording || q.question_text}</p>
            {q.helper_text && <p style={{ fontSize: nv.helperSize, color: nv.helperColor, marginBottom: nv.spaceQuestionAnswers }}>{q.helper_text}</p>}

            <WizardQuestionFields
              q={q}
              sec={sec}
              nv={nv}
              answers={answers}
              extras={extras}
              handleAnswer={handleAnswer}
              handleExtras={handleExtras}
              maxPhotos={MAX_PHOTOS_PER_QUESTION}
              isMobile={false}
            />
          </div>
        ))}

        {saving && <p style={{ fontSize: nv.metaSize, color: nv.muted }}>Saving…</p>}

        {/* Sticky bar: white bg, top border 1px #E5E7EB, padding 12px 16px; primary blue #1E3A8A, secondary outline */}
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: nv.stickyPad, backgroundColor: nv.stickyBarBg, borderTop: nv.stickyBarBorder, display: 'flex', justifyContent: 'space-between', gap: 8, maxWidth: 560, margin: '0 auto' }}>
          <button type="button" onClick={() => setStep((prev) => Math.max(0, prev - 1))} style={{ padding: `12px ${nv.btnPx}px`, minHeight: nv.btnMinHeight, border: nv.btnUnselectedBorder, borderRadius: nv.btnRadius, background: nv.cardBg, fontWeight: 500, cursor: 'pointer', fontSize: nv.baseSize, transition: nv.transition }}>Back</button>
          <button type="button" onClick={saveCurrentSection} disabled={saving} style={{ padding: `12px ${nv.btnPx}px`, minHeight: nv.btnMinHeight, border: nv.btnUnselectedBorder, borderRadius: nv.btnRadius, background: nv.cardBg, fontWeight: 500, cursor: saving ? 'not-allowed' : 'pointer', fontSize: nv.baseSize }}>{saving ? 'Saving…' : 'Save'}</button>
          <button type="button" onClick={() => setStep((prev) => (prev >= sections.length + 1 ? prev : prev + 1))} style={{ padding: `12px ${nv.btnPx}px`, minHeight: nv.btnMinHeight, backgroundColor: nv.primary, color: '#fff', border: 'none', borderRadius: nv.btnRadius, fontWeight: nv.btnFontWeight, cursor: 'pointer', fontSize: nv.baseSize, transition: nv.transition }}>{step === sections.length ? 'Review' : 'Next'}</button>
        </div>
      </div>
    </div>
  )
}
