'use client'

import { useMemo, useState } from 'react'
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

const RATING_KEYS = [
  { id: 'ew_r_grounds', label: 'Grounds maintenance' },
  { id: 'ew_r_paving', label: 'Paving & signage' },
  { id: 'ew_r_communal', label: 'Communal repairs' },
  { id: 'ew_r_internal', label: 'Internal cleaning' },
  { id: 'ew_r_overall', label: 'Overall estate standard' },
]

function newChecklistItem() {
  return {
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `item_${Date.now()}_${Math.random()}`,
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

  const [responsible, setResponsible] = useState('')
  const [role, setRole] = useState('')
  const [areaText, setAreaText] = useState('')
  const [postcode, setPostcode] = useState('')
  const [plannedDate, setPlannedDate] = useState('')

  const [ratings, setRatings] = useState(() =>
    Object.fromEntries(RATING_KEYS.map((r) => [r.id, '']))
  )
  const [checklist, setChecklist] = useState(() => [])

  const [submitError, setSubmitError] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [validationErrors, setValidationErrors] = useState({})

  const blocksForEstate = useMemo(
    () => blocks.filter((b) => b.estate_id && b.estate_id === estateId),
    [blocks, estateId]
  )

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
    if (!responsible.trim()) errs.ew_q_responsible = 'Required'
    if (!role.trim()) errs.ew_q_role = 'Required'
    if (!areaText.trim()) errs.ew_q_area = 'Required'
    if (!postcode.trim()) errs.ew_q_postcode = 'Required'
    if (!plannedDate.trim()) errs.ew_q_planned_date = 'Required'

    for (const r of RATING_KEYS) {
      const v = ratings[r.id]
      if (!v || !String(v).trim()) errs[r.id] = 'Select A–D'
    }

    checklist.forEach((it, i) => {
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

    setIsSubmitting(true)
    try {
      const answers = {
        ew_q_responsible: responsible.trim(),
        ew_q_role: role.trim(),
        ew_q_area: areaText.trim(),
        ew_q_postcode: postcode.trim(),
        ew_q_planned_date: plannedDate.trim(),
        ...Object.fromEntries(RATING_KEYS.map((r) => [r.id, ratings[r.id]])),
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
          answers,
          answer_extras: {},
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

  const ratingChip = (qid, letter) => {
    const selected = ratings[qid] === letter
    return (
      <button
        key={letter}
        type="button"
        onClick={() => setRatings((prev) => ({ ...prev, [qid]: letter }))}
        style={{
          minWidth: 44,
          minHeight: 44,
          padding: '0 14px',
          borderRadius: 8,
          border: selected ? `2px solid ${EW.accent}` : `1px solid ${EW.border}`,
          background: selected ? EW.accentMuted : '#fff',
          color: EW.text,
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        {letter}
      </button>
    )
  }

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
          <p style={{ margin: '10px 0 0', color: EW.muted, fontSize: 16, maxWidth: 640 }}>
            Checklist and action plan. Ratings are for reporting only and do not create actions. Actions are created only
            when you tick Action Required on a checklist row.
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

          {/* Location */}
          <section
            style={{
              background: EW.card,
              border: `1px solid ${EW.border}`,
              borderRadius: EW.radius,
              padding: 24,
              marginBottom: 20,
            }}
          >
            <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 700, color: EW.text }}>Location</h2>
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
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                style={inputStyle}
                placeholder="e.g. Zone B, rear courts"
              />
            </div>
            <div>
              <label style={labelStyle}>Description (optional)</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                style={{ ...inputStyle, minHeight: 72 }}
              />
            </div>
          </section>

          {!templateLocked && (
            <section
              style={{
                background: EW.card,
                border: `1px solid ${EW.border}`,
                borderRadius: EW.radius,
                padding: 24,
                marginBottom: 20,
              }}
            >
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

          {/* Header / visit details */}
          <section
            style={{
              background: EW.card,
              border: `1px solid ${EW.border}`,
              borderRadius: EW.radius,
              padding: 24,
              marginBottom: 20,
            }}
          >
            <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: EW.text }}>Visit details</h2>
            <p style={{ margin: '0 0 20px', fontSize: 14, color: EW.muted }}>Who is attending and where the walkabout applies.</p>
            <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
              <div>
                <label style={labelStyle}>Responsible person *</label>
                <input
                  value={responsible}
                  onChange={(e) => setResponsible(e.target.value)}
                  style={inputStyleErr(!!validationErrors.ew_q_responsible)}
                />
                {validationErrors.ew_q_responsible && <p style={errStyle}>{validationErrors.ew_q_responsible}</p>}
              </div>
              <div>
                <label style={labelStyle}>Role *</label>
                <input
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  style={inputStyleErr(!!validationErrors.ew_q_role)}
                />
                {validationErrors.ew_q_role && <p style={errStyle}>{validationErrors.ew_q_role}</p>}
              </div>
              <div>
                <label style={labelStyle}>Estate / area *</label>
                <input
                  value={areaText}
                  onChange={(e) => setAreaText(e.target.value)}
                  style={inputStyleErr(!!validationErrors.ew_q_area)}
                  placeholder="Area covered on foot"
                />
                {validationErrors.ew_q_area && <p style={errStyle}>{validationErrors.ew_q_area}</p>}
              </div>
              <div>
                <label style={labelStyle}>Postcode *</label>
                <input
                  value={postcode}
                  onChange={(e) => setPostcode(e.target.value)}
                  style={inputStyleErr(!!validationErrors.ew_q_postcode)}
                />
                {validationErrors.ew_q_postcode && <p style={errStyle}>{validationErrors.ew_q_postcode}</p>}
              </div>
              <div>
                <label style={labelStyle}>Planned date *</label>
                <input
                  type="date"
                  value={plannedDate}
                  onChange={(e) => setPlannedDate(e.target.value)}
                  style={inputStyleErr(!!validationErrors.ew_q_planned_date)}
                />
                {validationErrors.ew_q_planned_date && <p style={errStyle}>{validationErrors.ew_q_planned_date}</p>}
              </div>
            </div>
          </section>

          {/* Ratings */}
          <section
            style={{
              background: EW.card,
              border: `1px solid ${EW.border}`,
              borderRadius: EW.radius,
              padding: 24,
              marginBottom: 20,
            }}
          >
            <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: EW.text }}>Ratings (A–D)</h2>
            <p style={{ margin: '0 0 20px', fontSize: 14, color: EW.muted }}>
              For reporting only — these do not create follow-up actions.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {RATING_KEYS.map((r) => (
                <div
                  key={r.id}
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: 12,
                    justifyContent: 'space-between',
                    padding: '12px 0',
                    borderBottom: `1px solid ${EW.border}`,
                  }}
                >
                  <span style={{ fontWeight: 600, color: EW.text, flex: '1 1 200px' }}>{r.label}</span>
                  <div style={{ display: 'flex', gap: 8 }}>{['A', 'B', 'C', 'D'].map((L) => ratingChip(r.id, L))}</div>
                  {validationErrors[r.id] && (
                    <p style={{ ...errStyle, width: '100%', margin: 0 }}>{validationErrors[r.id]}</p>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Checklist */}
          <section
            style={{
              background: EW.card,
              border: `1px solid ${EW.border}`,
              borderRadius: EW.radius,
              padding: 24,
              marginBottom: 24,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: EW.text }}>Checklist &amp; action plan</h2>
                <p style={{ margin: 0, fontSize: 14, color: EW.muted }}>
                  Add rows for each inspection item. Actions are only created when Action Required is checked.
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
                No checklist rows yet. Use &quot;Add item&quot; when you are ready to record inspection items and optional actions.
              </p>
            )}
            <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
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
                  <div style={{ fontWeight: 700, marginBottom: 12, color: EW.text }}>Item {idx + 1}</div>
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
                      id={`ew-photo-${it.id}`}
                      value={it.photo_urls}
                      onChange={(urls) => updateItem(it.id, { photo_urls: urls })}
                      label="Photo upload"
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
                        placeholder="What should happen next?"
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
