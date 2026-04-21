'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import PhotoUploadControl from '@/app/components/questions/PhotoUploadControl'
import {
  ESTATE_WALKABOUT_CHECKLIST_QID,
  ESTATE_WALKABOUT_TEMPLATE_ID,
} from '@/lib/estate-walkabout-template'

const EW = {
  pageBg: '#f1f5f9',
  card: '#ffffff',
  border: '#e2e8f0',
  accent: '#059669',
  accentMuted: '#d1fae5',
  text: '#0f172a',
  muted: '#64748b',
  radius: 12,
}

const HEADER_KEYS = ['ew_q_responsible', 'ew_q_role', 'ew_q_area', 'ew_q_postcode', 'ew_q_planned_date']

const STAFF_YN = [
  ['ew_st_caretaker_present', 'Is there a caretaker present?'],
  ['ew_st_repairs_officer_present', 'Is there a repairs officer present?'],
]

const ITEM_YN = [
  ['ew_it_tank_secure', 'Is the tank room secure?'],
  ['ew_it_communal_lighting', 'Have you inspected the communal lighting?'],
  ['ew_it_glazing', 'Have you inspected the communal glazing and window frames?'],
  ['ew_it_refuse_chutes', 'Are the refuse chutes clear?'],
  ['ew_it_overflows', 'Are there any overflows or leaks?'],
  ['ew_it_drains', 'Are the drains and gulleys clear?'],
  ['ew_it_estate_roads', 'Have you inspected the estate roads?'],
  [
    'ew_it_grounds',
    'Have you inspected the grass cutting, trees, flower beds and hedges?',
  ],
  ['ew_it_abandoned_vehicles', 'Are there any abandoned vehicles?'],
  ['ew_it_parking', 'Have you inspected the parking/garage areas?'],
  ['ew_it_sheds', 'Have you inspected the sheds?'],
  ['ew_it_graffiti', 'Is there any graffiti?'],
  ['ew_it_signs', 'Have you inspected the estate signs?'],
]

/** Question ids that may carry photo_urls in answer_extras (matches on-form photo pickers). */
const PHOTO_EXTRA_IDS = new Set([
  'ew_st_repairs_officer_select',
  'ew_st_resident_rep_name',
  'ew_st_comments',
  'ew_ec_paving_grade',
  'ew_ec_comments',
  'ew_os_comments',
  'ew_it_roof_access',
  'ew_it_comments',
  'ew_sig_inspection_date',
])

function emptyAnswers() {
  const keys = [
    ...HEADER_KEYS,
    ...STAFF_YN.map(([id]) => id),
    'ew_st_repairs_officer_select',
    'ew_st_resident_rep_name',
    'ew_st_comments',
    'ew_ec_paving_grade',
    'ew_ec_comments',
    'ew_os_comments',
    'ew_it_roof_access',
    ...ITEM_YN.map(([id]) => id),
    'ew_it_comments',
    'ew_sig_inspection_date',
  ]
  return Object.fromEntries(keys.map((k) => [k, '']))
}

function newChecklistItem() {
  return {
    id:
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `item_${Date.now()}_${Math.random()}`,
    description: '',
    status: 'NA',
    photo_urls: [],
    action_required: false,
    action_summary: '',
  }
}

export default function EstateWalkaboutNewInspectionForm({
  estates = [],
  blocks = [],
  templates = [],
  templateId,
  setTemplateId,
  templateLocked = false,
}) {
  const router = useRouter()
  const [estateId, setEstateId] = useState('')
  const [postgresBlockId, setPostgresBlockId] = useState('')
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')

  const [answers, setAnswers] = useState(emptyAnswers)
  const [answerExtras, setAnswerExtras] = useState({})
  const [checklist, setChecklist] = useState(() => [])
  const [peopleOptions, setPeopleOptions] = useState([])

  const [submitError, setSubmitError] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [validationErrors, setValidationErrors] = useState({})

  const blocksForEstate = useMemo(
    () => blocks.filter((b) => b.estate_id && b.estate_id === estateId),
    [blocks, estateId]
  )

  useEffect(() => {
    let cancelled = false
    async function loadPeople() {
      try {
        const res = await fetch('/api/people', { cache: 'no-store', credentials: 'include' })
        if (!res.ok || cancelled) return
        const rows = await res.json()
        if (cancelled || !Array.isArray(rows)) return
        setPeopleOptions(
          rows
            .map((p) => ({
              value: p.id != null ? String(p.id) : '',
              label: p.name ? `${p.name}${p.email ? ` (${p.email})` : ''}` : p.email || String(p.id ?? ''),
            }))
            .filter((x) => x.value && x.label)
        )
      } catch {
        /* ignore */
      }
    }
    loadPeople()
    return () => {
      cancelled = true
    }
  }, [])

  const setField = (id, val) => {
    setAnswers((prev) => ({ ...prev, [id]: val }))
    setValidationErrors((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  const setPhotos = (id, urls) => {
    if (!PHOTO_EXTRA_IDS.has(id)) return
    setAnswerExtras((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || {}), photo_urls: urls },
    }))
  }

  const getPhotos = (id) => (Array.isArray(answerExtras[id]?.photo_urls) ? answerExtras[id].photo_urls : [])

  const updateItem = (itemId, patch) => {
    setChecklist((prev) => prev.map((it) => (it.id === itemId ? { ...it, ...patch } : it)))
  }

  const validate = () => {
    const errs = {}
    if (!estateId?.trim()) errs.estate_id = 'Select an estate'
    if (postgresBlockId) {
      const b = blocksForEstate.find((x) => x.id === postgresBlockId)
      if (!b) errs.block_id = 'Invalid block for this estate'
    }
    if (!templateLocked && (!templateId || templateId !== ESTATE_WALKABOUT_TEMPLATE_ID)) {
      errs.template_id = 'Select Estate Walkabout'
    }

    for (const k of HEADER_KEYS) {
      if (!String(answers[k] || '').trim()) errs[k] = 'Required'
    }

    for (const [id] of STAFF_YN) {
      const v = String(answers[id] || '').trim()
      if (!['Yes', 'No', 'NA'].includes(v)) errs[id] = 'Select Yes, No, or NA'
    }

    if (answers.ew_st_repairs_officer_present === 'Yes') {
      if (!String(answers.ew_st_repairs_officer_select || '').trim()) {
        errs.ew_st_repairs_officer_select = 'Select the repairs officer'
      }
    }

    const g1 = String(answers.ew_ec_paving_grade || '').trim()
    if (!g1 || !['A', 'B', 'C', 'D', 'NA'].includes(g1)) {
      errs.ew_ec_paving_grade = 'Select A, B, C, D, or NA'
    }

    const g2 = String(answers.ew_it_roof_access || '').trim()
    if (!g2 || !['A', 'B', 'C', 'D', 'NA'].includes(g2)) {
      errs.ew_it_roof_access = 'Select A, B, C, D, or NA'
    }

    for (const [id] of ITEM_YN) {
      const v = String(answers[id] || '').trim()
      if (!['Yes', 'No', 'NA'].includes(v)) errs[id] = 'Select Yes, No, or NA'
    }

    if (!String(answers.ew_sig_inspection_date || '').trim()) {
      errs.ew_sig_inspection_date = 'Enter the inspection date'
    }

    checklist.forEach((it) => {
      if (it.action_required && !String(it.action_summary || '').trim()) {
        errs[`checklist_${it.id}`] = 'Action summary is required when Action Required is checked'
      }
      if (!String(it.description || '').trim()) {
        errs[`checklist_desc_${it.id}`] = 'Description is required for each row (or remove the row)'
      }
    })

    setValidationErrors(errs)
    return errs
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitError(null)
    const errs = validate()
    if (Object.keys(errs).length > 0) return

    const extras = {}
    for (const id of PHOTO_EXTRA_IDS) {
      const urls = getPhotos(id).filter((u) => typeof u === 'string' && u)
      if (urls.length > 0) extras[id] = { photo_urls: urls }
    }

    setIsSubmitting(true)
    try {
      const payloadAnswers = {
        ...answers,
        [ESTATE_WALKABOUT_CHECKLIST_QID]: JSON.stringify(
          checklist.map((it) => ({
            id: it.id,
            description: (it.description || '').trim(),
            status: it.status,
            photo_urls: Array.isArray(it.photo_urls) ? it.photo_urls : [],
            action_required: !!it.action_required,
            action_summary: String(it.action_summary || '').trim(),
          }))
        ),
      }

      const res = await fetch('/api/inspections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          template_id: ESTATE_WALKABOUT_TEMPLATE_ID,
          estate_id: estateId.trim(),
          block_id: postgresBlockId.trim() || undefined,
          location: location.trim() || undefined,
          description: description.trim() || undefined,
          answers: payloadAnswers,
          answer_extras: extras,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setSubmitError(data?.error || data?.details || `Request failed (${res.status})`)
        return
      }
      if (data.error) {
        setSubmitError(data.error || data.details || 'Save failed')
        return
      }
      const inspectionId = data.inspectionId ?? data.id
      if (inspectionId) router.push(`/inspections/${inspectionId}`)
      else setSubmitError('Save reported success but no inspection ID was returned.')
    } catch (err) {
      setSubmitError(err.message || 'Something went wrong')
    } finally {
      setIsSubmitting(false)
    }
  }

  const yna = (qid, label) => (
    <div style={{ marginBottom: 18 }}>
      <span style={{ fontWeight: 600, display: 'block', marginBottom: 8, color: EW.text }}>{label}</span>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {['Yes', 'No', 'NA'].map((s) => {
          const sel = answers[qid] === s
          return (
            <button
              key={s}
              type="button"
              onClick={() => setField(qid, s)}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                border: sel ? `2px solid ${EW.accent}` : `1px solid ${EW.border}`,
                background: sel ? EW.accentMuted : '#fff',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {s}
            </button>
          )
        })}
      </div>
      {validationErrors[qid] && <p style={errStyle}>{validationErrors[qid]}</p>}
    </div>
  )

  const gradeAbcdNa = (qid, label, sub) => (
    <div style={{ marginBottom: 18 }}>
      <span style={{ fontWeight: 600, display: 'block', marginBottom: 4, color: EW.text }}>{label}</span>
      {sub ? (
        <p style={{ margin: '0 0 8px', fontSize: 13, color: EW.muted }}>{sub}</p>
      ) : null}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {['A', 'B', 'C', 'D', 'NA'].map((L) => {
          const sel = answers[qid] === L
          return (
            <button
              key={L}
              type="button"
              onClick={() => setField(qid, L)}
              style={{
                minWidth: 44,
                minHeight: 44,
                padding: '0 12px',
                borderRadius: 8,
                border: sel ? `2px solid ${EW.accent}` : `1px solid ${EW.border}`,
                background: sel ? EW.accentMuted : '#fff',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {L}
            </button>
          )
        })}
      </div>
      {validationErrors[qid] && <p style={errStyle}>{validationErrors[qid]}</p>}
      <div style={{ marginTop: 10 }}>
        <PhotoUploadControl id={`ph-${qid}`} value={getPhotos(qid)} onChange={(urls) => setPhotos(qid, urls)} label="Add photo" />
      </div>
    </div>
  )

  const commentBlock = (qid, title) => (
    <div style={{ marginBottom: 18 }}>
      <label style={labelStyle}>{title}</label>
      <textarea
        value={answers[qid] || ''}
        onChange={(e) => setField(qid, e.target.value)}
        rows={3}
        style={{ ...inputStyle, minHeight: 72 }}
      />
      <div style={{ marginTop: 8 }}>
        <PhotoUploadControl id={`ph-${qid}`} value={getPhotos(qid)} onChange={(urls) => setPhotos(qid, urls)} label="Add photo" />
      </div>
    </div>
  )

  return (
    <div style={{ background: EW.pageBg, minHeight: '100vh', padding: '1.5rem' }}>
      <div style={{ maxWidth: 880, margin: '0 auto' }}>
        <Link href="/" style={{ color: EW.accent, textDecoration: 'none', fontSize: 14 }}>
          ← Back to Inspections
        </Link>
        <header style={{ marginTop: 16, marginBottom: 28 }}>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: EW.text, letterSpacing: -0.02 }}>
            Estate Walkabout
          </h1>
          <p style={{ margin: '10px 0 0', color: EW.muted, fontSize: 16, maxWidth: 720 }}>
            Structured walkabout sections. Ratings and Y/N answers do not create actions by themselves. Use{' '}
            <strong>Additional items &amp; action plan</strong> at the end to log follow-up actions when needed.
          </p>
        </header>

        <form onSubmit={handleSubmit}>
          {submitError && (
            <div
              style={{
                padding: 12,
                marginBottom: 20,
                background: '#fef2f2',
                color: '#b91c1c',
                borderRadius: EW.radius,
                fontSize: 14,
              }}
            >
              {submitError}
            </div>
          )}

          <section style={cardStyle}>
            <h2 style={h2Style}>Location</h2>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Estate *</label>
              <select
                value={estateId}
                onChange={(e) => {
                  setEstateId(e.target.value)
                  setPostgresBlockId('')
                }}
                style={selectStyle(!!validationErrors.estate_id)}
              >
                <option value="">— Select estate —</option>
                {estates.map((est) => (
                  <option key={est.id} value={est.id}>
                    {est.name}
                  </option>
                ))}
              </select>
              {validationErrors.estate_id && <p style={errStyle}>{validationErrors.estate_id}</p>}
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Block (optional)</label>
              <select
                value={postgresBlockId}
                onChange={(e) => setPostgresBlockId(e.target.value)}
                disabled={!estateId}
                style={{ ...selectStyle(!!validationErrors.block_id), background: estateId ? '#fff' : '#f1f5f9' }}
              >
                <option value="">Whole estate</option>
                {blocksForEstate.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Location note (optional)</label>
              <input value={location} onChange={(e) => setLocation(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Description (optional)</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} style={{ ...inputStyle, minHeight: 72 }} />
            </div>
          </section>

          {!templateLocked && (
            <section style={cardStyle}>
              <label style={labelStyle}>Template *</label>
              <select
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                style={selectStyle(!!validationErrors.template_id)}
              >
                <option value="">— Select —</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {(t.name || t.template_key || t.id || '').toString()}
                  </option>
                ))}
              </select>
              {validationErrors.template_id && <p style={errStyle}>{validationErrors.template_id}</p>}
            </section>
          )}

          <section style={cardStyle}>
            <h2 style={h2Style}>Visit details</h2>
            <p style={{ margin: '0 0 16px', fontSize: 14, color: EW.muted }}>Lead officer and planned visit.</p>
            <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              <div>
                <label style={labelStyle}>Responsible person *</label>
                <input
                  value={answers.ew_q_responsible}
                  onChange={(e) => setField('ew_q_responsible', e.target.value)}
                  style={inputStyleErr(!!validationErrors.ew_q_responsible)}
                />
                {validationErrors.ew_q_responsible && <p style={errStyle}>{validationErrors.ew_q_responsible}</p>}
              </div>
              <div>
                <label style={labelStyle}>Role *</label>
                <input
                  value={answers.ew_q_role}
                  onChange={(e) => setField('ew_q_role', e.target.value)}
                  style={inputStyleErr(!!validationErrors.ew_q_role)}
                />
                {validationErrors.ew_q_role && <p style={errStyle}>{validationErrors.ew_q_role}</p>}
              </div>
              <div>
                <label style={labelStyle}>Estate / area *</label>
                <input
                  value={answers.ew_q_area}
                  onChange={(e) => setField('ew_q_area', e.target.value)}
                  style={inputStyleErr(!!validationErrors.ew_q_area)}
                />
                {validationErrors.ew_q_area && <p style={errStyle}>{validationErrors.ew_q_area}</p>}
              </div>
              <div>
                <label style={labelStyle}>Postcode *</label>
                <input
                  value={answers.ew_q_postcode}
                  onChange={(e) => setField('ew_q_postcode', e.target.value)}
                  style={inputStyleErr(!!validationErrors.ew_q_postcode)}
                />
                {validationErrors.ew_q_postcode && <p style={errStyle}>{validationErrors.ew_q_postcode}</p>}
              </div>
              <div>
                <label style={labelStyle}>Planned date *</label>
                <input
                  type="date"
                  value={answers.ew_q_planned_date}
                  onChange={(e) => setField('ew_q_planned_date', e.target.value)}
                  style={inputStyleErr(!!validationErrors.ew_q_planned_date)}
                />
                {validationErrors.ew_q_planned_date && <p style={errStyle}>{validationErrors.ew_q_planned_date}</p>}
              </div>
            </div>
          </section>

          {/* 1. Staff present */}
          <section style={cardStyle}>
            <h2 style={h2Style}>1. Staff present</h2>
            {yna('ew_st_caretaker_present', 'Is there a caretaker present?')}
            {yna('ew_st_repairs_officer_present', 'Is there a repairs officer present?')}
            <div style={{ marginBottom: 18 }}>
              <label style={labelStyle}>What is the name of the repairs officer?</label>
              <select
                value={answers.ew_st_repairs_officer_select}
                onChange={(e) => setField('ew_st_repairs_officer_select', e.target.value)}
                style={selectStyle(!!validationErrors.ew_st_repairs_officer_select)}
              >
                <option value="">— Select… —</option>
                {peopleOptions.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
              {validationErrors.ew_st_repairs_officer_select && (
                <p style={errStyle}>{validationErrors.ew_st_repairs_officer_select}</p>
              )}
              <div style={{ marginTop: 8 }}>
                <PhotoUploadControl
                  id="ph-repairs-officer"
                  value={getPhotos('ew_st_repairs_officer_select')}
                  onChange={(urls) => setPhotos('ew_st_repairs_officer_select', urls)}
                  label="Add photo"
                />
              </div>
            </div>
            <div style={{ marginBottom: 18 }}>
              <label style={labelStyle}>What is the name of the resident representative?</label>
              <input
                value={answers.ew_st_resident_rep_name}
                onChange={(e) => setField('ew_st_resident_rep_name', e.target.value)}
                style={inputStyle}
                placeholder="Name (optional)"
              />
              <div style={{ marginTop: 8 }}>
                <PhotoUploadControl
                  id="ph-resident-rep"
                  value={getPhotos('ew_st_resident_rep_name')}
                  onChange={(urls) => setPhotos('ew_st_resident_rep_name', urls)}
                  label="Add photo"
                />
              </div>
            </div>
            {commentBlock('ew_st_comments', 'Comments')}
          </section>

          {/* 2. Estate care */}
          <section style={cardStyle}>
            <h2 style={h2Style}>2. Estate care and communal repairs</h2>
            {gradeAbcdNa(
              'ew_ec_paving_grade',
              'What is the quality of the paving/potholes and signage?',
              'Croydon NV Grading – Final'
            )}
            {commentBlock('ew_ec_comments', 'Comments')}
          </section>

          {/* 3. Overall */}
          <section style={cardStyle}>
            <h2 style={h2Style}>3. Overall standards</h2>
            {commentBlock('ew_os_comments', 'Comments')}
          </section>

          {/* 4. Item inspections */}
          <section style={cardStyle}>
            <h2 style={h2Style}>4. Item inspections</h2>
            {gradeAbcdNa(
              'ew_it_roof_access',
              'Is the roof access secure?',
              'Croydon NV Grading – Final'
            )}
            {ITEM_YN.map(([id, lab]) => yna(id, lab))}
            {commentBlock('ew_it_comments', 'Comments')}
          </section>

          {/* 5. Signature */}
          <section style={cardStyle}>
            <h2 style={h2Style}>5. Signature and date</h2>
            <label style={labelStyle}>Please can you provide the date of the inspection completed today. *</label>
            <input
              type="date"
              value={answers.ew_sig_inspection_date}
              onChange={(e) => setField('ew_sig_inspection_date', e.target.value)}
              style={inputStyleErr(!!validationErrors.ew_sig_inspection_date)}
            />
            {validationErrors.ew_sig_inspection_date && <p style={errStyle}>{validationErrors.ew_sig_inspection_date}</p>}
            <div style={{ marginTop: 10 }}>
              <PhotoUploadControl
                id="ph-sig"
                value={getPhotos('ew_sig_inspection_date')}
                onChange={(urls) => setPhotos('ew_sig_inspection_date', urls)}
                label="Add photo"
              />
            </div>
          </section>

          {/* Additional action plan */}
          <section style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <h2 style={{ ...h2Style, marginBottom: 8 }}>Additional items &amp; action plan</h2>
                <p style={{ margin: 0, fontSize: 14, color: EW.muted }}>
                  Optional extra rows. Actions are only created when Action Required is checked.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setChecklist((c) => [...c, newChecklistItem()])}
                style={{
                  padding: '10px 16px',
                  background: EW.accent,
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                + Add item
              </button>
            </div>
            {checklist.length === 0 && (
              <p style={{ marginTop: 16, padding: 16, background: '#f8fafc', borderRadius: 8, color: EW.muted, fontSize: 14 }}>
                No additional rows. Use Add item if you need to log follow-up actions.
              </p>
            )}
            <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>
              {checklist.map((it, idx) => (
                <div
                  key={it.id}
                  style={{
                    padding: 20,
                    background: '#f8fafc',
                    borderRadius: EW.radius,
                    border: `1px solid ${EW.border}`,
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: 12, color: EW.text }}>Additional item {idx + 1}</div>
                  <label style={labelStyle}>Inspection item description *</label>
                  <textarea
                    value={it.description}
                    onChange={(e) => updateItem(it.id, { description: e.target.value })}
                    rows={2}
                    style={{
                      ...inputStyle,
                      minHeight: 64,
                      borderColor: validationErrors[`checklist_desc_${it.id}`] ? '#ef4444' : EW.border,
                    }}
                  />
                  {validationErrors[`checklist_desc_${it.id}`] && (
                    <p style={errStyle}>{validationErrors[`checklist_desc_${it.id}`]}</p>
                  )}
                  <div style={{ marginTop: 12 }}>
                    <span style={{ ...labelStyle, display: 'block', marginBottom: 8 }}>Status</span>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {['Yes', 'No', 'NA'].map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => updateItem(it.id, { status: s })}
                          style={{
                            padding: '8px 16px',
                            borderRadius: 8,
                            border: it.status === s ? `2px solid ${EW.accent}` : `1px solid ${EW.border}`,
                            background: it.status === s ? EW.accentMuted : '#fff',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <PhotoUploadControl
                      id={`ew-add-${it.id}`}
                      value={it.photo_urls}
                      onChange={(urls) => updateItem(it.id, { photo_urls: urls })}
                      label="Add photo"
                    />
                  </div>
                  <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
                    <input
                      type="checkbox"
                      checked={!!it.action_required}
                      onChange={(e) => updateItem(it.id, { action_required: e.target.checked })}
                    />
                    Action Required
                  </label>
                  {it.action_required && (
                    <div style={{ marginTop: 8 }}>
                      <label style={labelStyle}>Action Summary *</label>
                      <textarea
                        value={it.action_summary}
                        onChange={(e) => updateItem(it.id, { action_summary: e.target.value })}
                        rows={3}
                        style={{
                          ...inputStyle,
                          minHeight: 80,
                          borderColor: validationErrors[`checklist_${it.id}`] ? '#ef4444' : EW.border,
                        }}
                      />
                      {validationErrors[`checklist_${it.id}`] && (
                        <p style={errStyle}>{validationErrors[`checklist_${it.id}`]}</p>
                      )}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setChecklist((c) => c.filter((x) => x.id !== it.id))}
                    style={{
                      marginTop: 12,
                      padding: '6px 12px',
                      background: 'transparent',
                      border: `1px solid ${EW.border}`,
                      borderRadius: 8,
                      color: '#64748b',
                      cursor: 'pointer',
                    }}
                  >
                    Remove item
                  </button>
                </div>
              ))}
            </div>
          </section>

          <button
            type="submit"
            disabled={isSubmitting}
            style={{
              width: '100%',
              padding: '16px 24px',
              fontSize: 17,
              fontWeight: 700,
              background: EW.accent,
              color: '#fff',
              border: 'none',
              borderRadius: EW.radius,
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              opacity: isSubmitting ? 0.85 : 1,
            }}
          >
            {isSubmitting ? 'Saving…' : 'Save inspection'}
          </button>
        </form>
      </div>
    </div>
  )
}

const cardStyle = {
  background: EW.card,
  border: `1px solid ${EW.border}`,
  borderRadius: EW.radius,
  padding: 24,
  marginBottom: 20,
}

const h2Style = { margin: '0 0 16px', fontSize: 18, fontWeight: 700, color: EW.text }

const labelStyle = { display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600, color: '#334155' }
const errStyle = { margin: '6px 0 0', fontSize: 13, color: '#dc2626' }

function selectStyle(bad) {
  return {
    width: '100%',
    padding: '12px 14px',
    borderRadius: 8,
    border: bad ? '1px solid #ef4444' : `1px solid ${EW.border}`,
    fontSize: 16,
    minHeight: 48,
    background: '#fff',
  }
}

function inputStyleErr(bad) {
  return {
    width: '100%',
    padding: '12px 14px',
    borderRadius: 8,
    border: bad ? '1px solid #ef4444' : `1px solid ${EW.border}`,
    fontSize: 16,
    boxSizing: 'border-box',
  }
}

const inputStyle = inputStyleErr(false)
