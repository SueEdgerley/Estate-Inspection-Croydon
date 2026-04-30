'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import PhotoUploadControl from '@/app/components/questions/PhotoUploadControl'
import BestPracticeGuideButton from '@/app/components/BestPracticeGuideButton'
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
  ['ew_st_ward_cllr_present', 'Is there a Ward Cllr present?'],
]

const ITEM_YN = [
  ['ew_it_roof_access', 'Is the roof access secure?'],
  ['ew_it_tank_secure', 'Is the tank room secure?'],
  ['ew_it_electricity_intakes', 'Are the electricity intakes secure?'],
  ['ew_it_fire_doors_exits', 'Have you inspected the fire doors/exits?'],
  ['ew_it_communal_lighting', 'Have you inspected the communal lighting?'],
  ['ew_it_glazing', 'Have you inspected the communal glazing and window frames?'],
  ['ew_it_dry_risers', 'Have you inspected the dry risers?'],
  ['ew_it_lightning_conductors', 'Have you inspected the lightning conductors?'],
  ['ew_it_dust_chute_hoppers', 'Have you inspected the dust chute hoppers?'],
  ['ew_it_refuse_chutes', 'Are the refuse chutes clear?'],
  ['ew_it_refuse_chamber', 'Have you inspected the refuse chamber area?'],
  ['ew_it_overflows', 'Are there any overflows or leaks?'],
  ['ew_it_bulk_refuse_removal', 'Is a bulk refuse removal required?'],
  ['ew_it_lifts_working', 'Are the lifts working?'],
  ['ew_it_drains', 'Are the drains and gulleys clear?'],
  ['ew_it_tripping_hazards', 'Are there any tripping or slipping hazards?'],
  ['ew_it_estate_roads', 'Have you inspected the estate roads?'],
  [
    'ew_it_grounds',
    'Have you inspected the grass cutting, trees, flower beds and hedges?',
  ],
  ['ew_it_door_entry', 'Have you inspected the communal door entry system?'],
  ['ew_it_abandoned_vehicles', 'Are there any abandoned vehicles?'],
  ['ew_it_parking', 'Have you inspected the parking/garage areas?'],
  ['ew_it_sheds', 'Have you inspected the sheds?'],
  ['ew_it_graffiti', 'Is there any graffiti?'],
  ['ew_it_signs', 'Have you inspected the estate signs?'],
  ['ew_it_play_areas', 'Have you inspected the play areas?'],
]

/** Question ids for answer_extras photo_urls. */
const PHOTO_EXTRA_IDS = new Set([
  'ew_ec_paving_grade',
  'ew_os_overall_grade',
  'ew_it_bulk_refuse_removal',
  'ew_it_comments_photo',
])

const YNA_COLORS = {
  Yes: { border: '#15803d', bg: '#dcfce7', selectedBg: '#16a34a', text: '#14532d' },
  No: { border: '#b91c1c', bg: '#fee2e2', selectedBg: '#dc2626', text: '#7f1d1d' },
  NA: { border: '#64748b', bg: '#f1f5f9', selectedBg: '#64748b', text: '#334155' },
}

const GRADE_COLORS = {
  A: { border: '#15803d', bg: '#dcfce7', selectedBg: '#16a34a', text: '#14532d' },
  B: { border: '#65a30d', bg: '#ecfccb', selectedBg: '#84cc16', text: '#365314' },
  C: { border: '#b45309', bg: '#fef3c7', selectedBg: '#f59e0b', text: '#78350f' },
  D: { border: '#b91c1c', bg: '#fee2e2', selectedBg: '#dc2626', text: '#7f1d1d' },
  NA: { border: '#64748b', bg: '#f1f5f9', selectedBg: '#64748b', text: '#334155' },
}

function emptyAnswers() {
  const keys = [
    ...HEADER_KEYS,
    ...STAFF_YN.map(([id]) => id),
    'ew_st_repairs_officer_select',
    'ew_st_resident_rep_name',
    'ew_st_comments',
    'ew_ec_paving_grade',
    'ew_ec_comments',
    'ew_os_overall_grade',
    'ew_os_comments',
    ...ITEM_YN.map(([id]) => id),
    'ew_it_comments',
    'ew_it_bulk_refuse_exact_location',
    'ew_it_bulk_refuse_comments',
    'ew_sig_signature',
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
    order_raised_number: '',
  }
}

export default function EstateWalkaboutNewInspectionForm({
  blocks = [],
  templates = [],
  templateId,
  setTemplateId,
  templateLocked = false,
}) {
  const router = useRouter()
  const [postgresBlockId, setPostgresBlockId] = useState('')
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')

  const [answers, setAnswers] = useState(emptyAnswers)
  const [answerExtras, setAnswerExtras] = useState({})
  const [checklist, setChecklist] = useState(() => [])
  const [peopleOptions, setPeopleOptions] = useState([])
  const [jobTitleOptions, setJobTitleOptions] = useState([])

  const [submitError, setSubmitError] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [validationErrors, setValidationErrors] = useState({})
  const [toastMessage, setToastMessage] = useState('')
  const toastTimerRef = useRef(null)

  const locationBlocks = useMemo(
    () => blocks.filter((b) => b != null && b.active !== false),
    [blocks]
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
              label: String(p.name || '').trim() || String(p.id ?? ''),
              jobTitle: String(p.job_title || '').trim(),
            }))
            .filter((x) => x.value && x.label)
        )
        setJobTitleOptions(
          Array.from(
            new Set(rows.map((p) => String(p.job_title || '').trim()).filter(Boolean))
          )
            .sort((a, b) => a.localeCompare(b))
            .map((jobTitle) => ({ value: jobTitle, label: jobTitle }))
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

  const showToast = (message) => {
    setToastMessage(message)
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => {
      setToastMessage('')
      toastTimerRef.current = null
    }, 4500)
  }

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    }
  }, [])

  const setYesNoNaField = (qid, value) => {
    setField(qid, value)
    if (qid !== 'ew_it_bulk_refuse_removal') return
    if (value === 'Yes') {
      showToast('An email notification will be sent to Nick Spenceley regarding bulk refuse removal.')
      return
    }
    setAnswerExtras((prev) => {
      if (!prev.ew_it_bulk_refuse_removal) return prev
      const next = { ...prev }
      delete next.ew_it_bulk_refuse_removal
      return next
    })
  }

  const setResponsiblePerson = (personId) => {
    setField('ew_q_responsible', personId)
    const selected = peopleOptions.find((person) => person.value === personId)
    if (selected?.jobTitle) {
      setField('ew_q_role', selected.jobTitle)
    }
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
    if (postgresBlockId) {
      const b = locationBlocks.find((x) => x.id === postgresBlockId)
      if (!b) errs.block_id = 'Choose a valid location or clear the selection'
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

    const gOs = String(answers.ew_os_overall_grade || '').trim()
    if (!gOs || !['A', 'B', 'C', 'D', 'NA'].includes(gOs)) {
      errs.ew_os_overall_grade = 'Select A, B, C, D, or NA'
    }

    for (const [id] of ITEM_YN) {
      const v = String(answers[id] || '').trim()
      if (!['Yes', 'No', 'NA'].includes(v)) errs[id] = 'Select Yes, No, or NA'
    }

    if (!String(answers.ew_sig_signature || '').trim()) {
      errs.ew_sig_signature = 'Enter a signature or signatory name'
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
            order_raised_number: String(it.order_raised_number || '').trim(),
          }))
        ),
      }

      const res = await fetch('/api/inspections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          template_id: ESTATE_WALKABOUT_TEMPLATE_ID,
          estate_id: undefined,
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
          const colors = YNA_COLORS[s]
          return (
            <button
              key={s}
              type="button"
              onClick={() => setYesNoNaField(qid, s)}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                border: sel ? `2px solid ${colors.border}` : `1px solid ${colors.border}`,
                background: sel ? colors.selectedBg : colors.bg,
                color: sel ? '#fff' : colors.text,
                fontWeight: 700,
                boxShadow: sel ? `0 0 0 3px ${colors.bg}` : 'none',
                minHeight: 42,
                minWidth: 58,
                cursor: 'pointer',
              }}
            >
              {s}
            </button>
          )
        })}
      </div>
      {validationErrors[qid] && <p style={errStyle}>{validationErrors[qid]}</p>}
      {qid === 'ew_it_bulk_refuse_removal' && answers.ew_it_bulk_refuse_removal === 'Yes' && (
        <div
          style={{
            marginTop: 12,
            padding: 14,
            border: `1px solid ${EW.border}`,
            borderRadius: EW.radius,
            background: '#f8fafc',
          }}
        >
          <p style={{ margin: '0 0 12px', fontSize: 14, color: EW.text, lineHeight: 1.45 }}>
            Bulk refuse removal email notification will be prepared when this inspection is saved.
          </p>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Exact location / block area</label>
            <input
              value={answers.ew_it_bulk_refuse_exact_location || ''}
              onChange={(e) => setField('ew_it_bulk_refuse_exact_location', e.target.value)}
              style={inputStyle}
              placeholder="e.g. Bin chamber, rear of block, car park bay"
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Comments for bulk refuse removal</label>
            <textarea
              value={answers.ew_it_bulk_refuse_comments || ''}
              onChange={(e) => setField('ew_it_bulk_refuse_comments', e.target.value)}
              rows={3}
              style={{ ...inputStyle, minHeight: 72 }}
              placeholder="Add details for the removal team"
            />
          </div>
          <PhotoUploadControl
            id="ew-bulk-refuse-photo"
            value={getPhotos('ew_it_bulk_refuse_removal')}
            onChange={(urls) => setPhotos('ew_it_bulk_refuse_removal', urls)}
            label="Add bulk refuse photo"
            multiple={true}
          />
        </div>
      )}
    </div>
  )

  const itemInspectionsQuestion = () => (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'grid', gap: 18 }}>
        {ITEM_YN.map(([id, lab]) => yna(id, lab))}
      </div>
      <div
        style={{
          marginTop: 12,
          padding: 14,
          border: `1px solid ${EW.border}`,
          borderRadius: EW.radius,
          background: '#f8fafc',
        }}
      >
        <label style={labelStyle}>Comments</label>
        <textarea
          value={answers.ew_it_comments || ''}
          onChange={(e) => setField('ew_it_comments', e.target.value)}
          rows={3}
          style={{ ...inputStyle, minHeight: 72 }}
          placeholder="Add any additional item inspection comments"
        />
        <div style={{ marginTop: 12 }}>
          <PhotoUploadControl
            id="ew-it-comments-photo"
            value={getPhotos('ew_it_comments_photo')}
            onChange={(urls) => setPhotos('ew_it_comments_photo', urls)}
            label="Add photo"
            multiple={true}
          />
        </div>
      </div>
    </div>
  )

  const gradeAbcdNa = (qid, label, sub, opts = {}) => {
    const withPhoto = !!opts.withPhoto
    const maxSlot = typeof opts.maxPhotos === 'number' ? opts.maxPhotos : 3
    return (
      <div style={{ marginBottom: 18 }}>
        <span style={{ fontWeight: 600, display: 'block', marginBottom: 4, color: EW.text }}>{label}</span>
        {sub ? (
          <p style={{ margin: '0 0 8px', fontSize: 13, color: EW.muted }}>{sub}</p>
        ) : null}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['A', 'B', 'C', 'D', 'NA'].map((L) => {
            const sel = answers[qid] === L
            const colors = GRADE_COLORS[L]
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
                  border: sel ? `2px solid ${colors.border}` : `1px solid ${colors.border}`,
                  background: sel ? colors.selectedBg : colors.bg,
                  color: sel ? '#fff' : colors.text,
                  fontWeight: 700,
                  boxShadow: sel ? `0 0 0 3px ${colors.bg}` : 'none',
                  cursor: 'pointer',
                }}
              >
                {L}
              </button>
            )
          })}
        </div>
        {validationErrors[qid] && <p style={errStyle}>{validationErrors[qid]}</p>}
        {withPhoto ? (
          <div style={{ marginTop: 10 }}>
            <PhotoUploadControl
              id={`ph-${qid}`}
              value={getPhotos(qid).slice(0, maxSlot)}
              onChange={(urls) => setPhotos(qid, urls.slice(0, maxSlot))}
              label="Add photo"
              multiple={maxSlot > 1}
            />
          </div>
        ) : null}
      </div>
    )
  }

  const commentTextOnly = (qid, title) => (
    <div style={{ marginBottom: 18 }}>
      <label style={labelStyle}>{title}</label>
      <textarea
        value={answers[qid] || ''}
        onChange={(e) => setField(qid, e.target.value)}
        rows={3}
        style={{ ...inputStyle, minHeight: 72 }}
      />
    </div>
  )

  return (
    <div
      data-ew-walkabout-form="canon-2026-04"
      style={{ background: EW.pageBg, minHeight: '100vh', padding: '1.5rem' }}
    >
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
          {toastMessage && (
            <div
              role="status"
              aria-live="polite"
              style={{
                position: 'fixed',
                top: 16,
                right: 16,
                zIndex: 50,
                maxWidth: 360,
                padding: '12px 14px',
                borderRadius: 10,
                background: '#064e3b',
                color: '#fff',
                boxShadow: '0 10px 24px rgba(15, 23, 42, 0.18)',
                fontSize: 14,
                lineHeight: 1.45,
              }}
            >
              {toastMessage}
            </div>
          )}
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
            <p style={{ margin: '0 0 12px', fontSize: 14, color: EW.muted }}>
              Optional: choose a location from the list, or leave blank and use the location note below.
            </p>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Location (optional)</label>
              <select
                value={postgresBlockId}
                onChange={(e) => setPostgresBlockId(e.target.value)}
                style={selectStyle(!!validationErrors.block_id)}
              >
                <option value="">— None selected —</option>
                {locationBlocks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              {locationBlocks.length === 0 && (
                <p style={{ marginTop: 8, fontSize: 13, color: EW.muted }}>
                  No locations in the list yet. Contact your administrator if you expected to see blocks here.
                </p>
              )}
              {validationErrors.block_id && <p style={errStyle}>{validationErrors.block_id}</p>}
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
                <select
                  value={answers.ew_q_responsible}
                  onChange={(e) => setResponsiblePerson(e.target.value)}
                  style={selectStyle(!!validationErrors.ew_q_responsible)}
                >
                  <option value="">— Select… —</option>
                  {peopleOptions.map((person) => (
                    <option key={person.value} value={person.value}>
                      {person.label}
                    </option>
                  ))}
                </select>
                {validationErrors.ew_q_responsible && <p style={errStyle}>{validationErrors.ew_q_responsible}</p>}
              </div>
              <div>
                <label style={labelStyle}>Role *</label>
                <select
                  value={answers.ew_q_role}
                  onChange={(e) => setField('ew_q_role', e.target.value)}
                  style={selectStyle(!!validationErrors.ew_q_role)}
                >
                  <option value="">— Select… —</option>
                  {jobTitleOptions.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
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
            {yna('ew_st_ward_cllr_present', 'Is there a Ward Cllr present?')}
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
            </div>
            <div style={{ marginBottom: 18 }}>
              <label style={labelStyle}>What is the name of the resident representative?</label>
              <input
                value={answers.ew_st_resident_rep_name}
                onChange={(e) => setField('ew_st_resident_rep_name', e.target.value)}
                style={inputStyle}
                placeholder="Name (optional)"
              />
            </div>
            {commentTextOnly('ew_st_comments', 'Comments')}
          </section>

          {/* 2. Estate care */}
          <section style={cardStyle}>
            <h2 style={h2Style}>2. Estate care and communal repairs</h2>
            {gradeAbcdNa('ew_ec_paving_grade', 'What is the quality of the paving/potholes and signage?', 'Croydon NV Grading – Final', {
              withPhoto: true,
              maxPhotos: 1,
            })}
            {commentTextOnly('ew_ec_comments', 'Comments')}
          </section>

          {/* 3. Overall */}
          <section style={cardStyle}>
            <h2 style={h2Style}>3. Overall standards</h2>
            {gradeAbcdNa(
              'ew_os_overall_grade',
              'What is the quality of the internal cleanliness?',
              'Croydon NV Grading – Final',
              { withPhoto: true, maxPhotos: 1 }
            )}
            {commentTextOnly('ew_os_comments', 'Comments')}
          </section>

          {/* 4. Item inspections */}
          <section style={cardStyle}>
            <h2 style={h2Style}>4. Item inspections</h2>
            {itemInspectionsQuestion()}
          </section>

          {/* 5. Signature */}
          <section style={cardStyle}>
            <h2 style={h2Style}>5. Signature and date</h2>
            <p style={{ margin: '0 0 16px', fontSize: 15, color: EW.text, lineHeight: 1.5 }}>
              Please confirm this is a true record of the inspection completed today. *
            </p>
            <div style={{ marginBottom: 18 }}>
              <label style={labelStyle}>Signature *</label>
              <input
                value={answers.ew_sig_signature}
                onChange={(e) => setField('ew_sig_signature', e.target.value)}
                style={inputStyleErr(!!validationErrors.ew_sig_signature)}
                placeholder="Type or print name as signature"
                autoComplete="name"
              />
              {validationErrors.ew_sig_signature && <p style={errStyle}>{validationErrors.ew_sig_signature}</p>}
            </div>
            <div>
              <label style={labelStyle}>Date of inspection *</label>
              <input
                type="date"
                value={answers.ew_sig_inspection_date}
                onChange={(e) => setField('ew_sig_inspection_date', e.target.value)}
                style={inputStyleErr(!!validationErrors.ew_sig_inspection_date)}
              />
              {validationErrors.ew_sig_inspection_date && <p style={errStyle}>{validationErrors.ew_sig_inspection_date}</p>}
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
                      <div style={{ marginTop: 12 }}>
                        <PhotoUploadControl
                          id={`ew-action-photo-${it.id}`}
                          value={(it.photo_urls || []).slice(0, 1)}
                          onChange={(urls) => updateItem(it.id, { photo_urls: urls.slice(0, 1) })}
                          label="Add action photo"
                          multiple={false}
                        />
                      </div>
                      <div style={{ marginTop: 12 }}>
                        <label style={labelStyle}>Order raised number (optional)</label>
                        <input
                          value={it.order_raised_number || ''}
                          onChange={(e) => updateItem(it.id, { order_raised_number: e.target.value })}
                          style={inputStyle}
                        />
                      </div>
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
        <BestPracticeGuideButton
          title="Estate Walkabout Best Practice Guide"
          templateId={ESTATE_WALKABOUT_TEMPLATE_ID}
          templateKey="estate_walkabout"
          templateName="Estate Walkabout"
        />
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
