'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import {
  actionInspectionDate,
  buildActionDisplay,
  cleanActionDisplayText,
  displayActionStatus,
  formatActionDate,
} from '@/lib/action-display-formatter'

const STATUS_OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'closed', label: 'Closed' },
]

const PRIORITY_OPTIONS = ['', 'low', 'medium', 'high', 'urgent']

function notRecorded(value) {
  if (value === undefined || value === null) return 'Not recorded'
  const text = String(value).trim()
  return text || 'Not recorded'
}

function dateInputValue(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

function actionSearchText(action) {
  const display = buildActionDisplay(action)
  return [
    display.section,
    display.issue,
    display.rating,
    display.comment,
    display.location,
    display.blockLocation,
    display.status,
    display.priority,
    display.assignedTo,
    display.jobNumber,
    display.submittedBy,
    display.inspectionDate,
    cleanActionDisplayText(action.assigned_to_email),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

export default function ActionsPage() {
  const [actions, setActions] = useState([])
  const [people, setPeople] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [form, setForm] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [downloadingActionPlan, setDownloadingActionPlan] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [inspectionId, setInspectionId] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')

  const selectedAction = actions.find((action) => action.id === selectedId) || null
  const filteredActions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return actions
    return actions.filter((action) => actionSearchText(action).includes(query))
  }, [actions, searchQuery])
  const selectedActionVisible = selectedAction && filteredActions.some((action) => action.id === selectedAction.id)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setInspectionId(params.get('inspection_id') || '')
  }, [])

  useEffect(() => {
    if (inspectionId === null) return
    const loadActions = async () => {
      try {
        const url = inspectionId ? `/api/actions?inspection_id=${encodeURIComponent(inspectionId)}` : '/api/actions'
        const res = await fetch(url, { cache: 'no-store', credentials: 'include' })
        const data = await res.json().catch(() => [])
        setActions(Array.isArray(data) ? data : [])
        if (Array.isArray(data) && data.length > 0 && window.innerWidth >= 900) {
          setSelectedId(data[0].id)
        }
      } catch (error) {
        console.error('Error loading actions:', error)
      } finally {
        setLoading(false)
      }
    }

    loadActions()
  }, [inspectionId])

  useEffect(() => {
    let cancelled = false
    async function loadPeople() {
      try {
        const res = await fetch('/api/people', { cache: 'no-store', credentials: 'include' })
        const data = await res.json().catch(() => [])
        if (!cancelled && Array.isArray(data)) setPeople(data)
      } catch (err) {
        console.warn('Could not load people for action assignment:', err)
      }
    }
    loadPeople()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!selectedAction) {
      setForm({})
      return
    }
    setForm({
      recipient_person_id: selectedAction.recipient_person_id || '',
      status: selectedAction.status || 'open',
      priority: selectedAction.priority || '',
      due_date: dateInputValue(selectedAction.expected_completion_date || selectedAction.inspection_due_date),
      job_number: selectedAction.job_number || '',
      expected_completion_date: dateInputValue(selectedAction.expected_completion_date),
      repair_notes: selectedAction.repair_notes || '',
    })
    setError('')
    setMessage('')
  }, [selectedAction])

  const formatShortDate = (dateString) => formatActionDate(dateString)

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const reloadActions = async (nextSelectedId = selectedId) => {
    const url = inspectionId ? `/api/actions?inspection_id=${encodeURIComponent(inspectionId)}` : '/api/actions'
    const res = await fetch(url, { cache: 'no-store', credentials: 'include' })
    const data = await res.json().catch(() => [])
    const rows = Array.isArray(data) ? data : []
    setActions(rows)
    if (nextSelectedId && rows.some((row) => row.id === nextSelectedId)) {
      setSelectedId(nextSelectedId)
    }
  }

  const saveAction = async () => {
    if (!selectedAction) return
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const dueDate = form.due_date || form.expected_completion_date || null
      const res = await fetch(`/api/actions/${encodeURIComponent(selectedAction.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          recipient_person_id: form.recipient_person_id || null,
          status: form.status || 'open',
          priority: form.priority || null,
          job_number: form.job_number || null,
          expected_completion_date: form.expected_completion_date || dueDate,
          repair_notes: form.repair_notes || null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || data.details || 'Could not update action')
      setMessage('Action updated.')
      await reloadActions(data.id || selectedAction.id)
    } catch (err) {
      setError(err?.message || 'Could not update action')
    } finally {
      setSaving(false)
    }
  }

  const closeDetail = () => setSelectedId('')
  const downloadActionPlanPdf = async () => {
    if (!inspectionId) return
    setDownloadingActionPlan(true)
    setError('')
    try {
      const res = await fetch('/api/actions/action-plan-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          inspectionId,
          actionIds: filteredActions.map((action) => action.id),
        }),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(text || 'Could not generate action plan PDF')
      }
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `action-plan.pdf`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      setError(err?.message || 'Could not generate action plan PDF')
    } finally {
      setDownloadingActionPlan(false)
    }
  }
  const inspectionFilterAction = actions[0]
  const inspectionFilterDisplay = inspectionFilterAction ? buildActionDisplay(inspectionFilterAction) : null
  const inspectionFilterLabel = inspectionFilterAction
    ? [
        inspectionFilterDisplay.location,
        inspectionFilterDisplay.blockLocation,
        formatShortDate(actionInspectionDate(inspectionFilterAction)),
      ].filter(Boolean).join(' - ')
    : ''

  return (
    <div>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 'bold', color: '#111827' }}>
          Issues / Actions
        </h1>
        <p style={{ margin: '0.5rem 0 0 0', color: '#6b7280' }}>
          Issues and actions raised from inspection forms
        </p>
      </div>

      {inspectionId ? (
        <div style={filterBannerStyle}>
          <div>
            <strong>Showing issues for inspection:</strong> {inspectionFilterLabel || 'Selected inspection'}
          </div>
          <div style={filterActionsStyle}>
            <button
              type="button"
              onClick={downloadActionPlanPdf}
              disabled={downloadingActionPlan}
              style={{
                ...downloadPdfButtonStyle,
                opacity: downloadingActionPlan ? 0.72 : 1,
                cursor: downloadingActionPlan ? 'wait' : 'pointer',
              }}
            >
              {downloadingActionPlan ? 'Preparing PDF...' : 'Download Action Plan PDF'}
            </button>
            <Link href="/actions" style={clearFilterLinkStyle}>
              Clear filter
            </Link>
          </div>
        </div>
      ) : null}

      <div style={searchWrapStyle}>
        <label htmlFor="action-search" style={{ display: 'block', fontWeight: 700, color: '#111827', marginBottom: '0.35rem' }}>
          Search issues
        </label>
        <input
          id="action-search"
          type="search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search by block, location, issue, status, assignee, job number..."
          style={inputStyle}
        />
        <p style={{ margin: '0.5rem 0 0', color: '#64748b', fontSize: '0.875rem' }}>
          Showing {filteredActions.length} of {actions.length} issues
        </p>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
          Loading issues…
        </div>
      ) : actions.length === 0 ? (
        <div style={{
          backgroundColor: 'white',
          padding: '3rem',
          borderRadius: '0.5rem',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          textAlign: 'center'
        }}>
          <p style={{ fontSize: '1.125rem', color: '#6b7280' }}>
            No issues found
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))', gap: '1rem', alignItems: 'start' }}>
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {filteredActions.length === 0 ? (
              <div style={emptySearchStyle}>
                No issues match your search.
              </div>
            ) : null}
            {filteredActions.map((a) => {
              const display = buildActionDisplay(a)
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setSelectedId(a.id)}
                  style={{
                    ...cardButtonStyle,
                    borderColor: selectedId === a.id ? '#2563eb' : '#e5e7eb',
                    boxShadow: selectedId === a.id ? '0 0 0 2px rgba(37,99,235,0.12)' : '0 1px 3px rgba(15, 23, 42, 0.08)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                    <strong style={{ color: '#111827', fontSize: '1rem' }}>{notRecorded(display.issue || display.comment)}</strong>
                    <span style={statusBadgeStyle}>{display.status}</span>
                  </div>
                  <div style={{ marginTop: '0.5rem', color: '#64748b', fontSize: '0.875rem' }}>
                    {notRecorded(display.location)}
                  </div>
                  <div style={cardMetaGridStyle}>
                    <span><strong>Location:</strong> {notRecorded(display.blockLocation)}</span>
                    <span><strong>Inspection date:</strong> {display.inspectionDate}</span>
                    <span><strong>Section/category:</strong> {notRecorded(display.section)}</span>
                  </div>
                  <div style={{ marginTop: '0.35rem', color: '#334155', fontSize: '0.875rem' }}>
                    Assigned: {notRecorded(display.assignedTo)} | Priority: {notRecorded(display.priority)}
                    {display.jobNumber ? ` | Job: ${display.jobNumber}` : ''}
                    {display.hasPhoto ? ' | Photo attached' : ''}
                  </div>
                </button>
              )
            })}
          </div>

          {selectedAction && selectedActionVisible ? (
            <ActionDetail
              action={selectedAction}
              form={form}
              people={people}
              setField={setField}
              saveAction={saveAction}
              saving={saving}
              error={error}
              message={message}
              onClose={closeDetail}
            />
          ) : null}
        </div>
      )}
    </div>
  )
}

function ActionDetail({ action, form, people, setField, saveAction, saving, error, message, onClose }) {
  const display = buildActionDisplay(action)
  const photos = display.photoUrls

  return (
    <aside style={detailStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start' }}>
        <div>
          <p style={{ margin: '0 0 0.35rem', color: '#64748b', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Action detail
          </p>
          <h2 style={{ margin: 0, color: '#111827', fontSize: '1.35rem' }}>
            {notRecorded(display.issue || display.comment)}
          </h2>
        </div>
        <button type="button" onClick={onClose} style={closeButtonStyle}>Close</button>
      </div>

      <section style={sectionStyle}>
        <h3 style={sectionHeadingStyle}>Issue</h3>
        <DetailRow label="Section/category" value={display.section} />
        <DetailRow label="Issue/question summary" value={display.issue} />
        {display.rating ? <DetailRow label="Rating" value={display.rating} /> : null}
        <DetailRow label="Comment" value={display.comment} multiline />
        <DetailRow label="Block/location" value={[display.location, display.blockLocation].filter(Boolean).join(' - ')} />
        {photos.length ? (
          <div style={{ marginTop: '0.75rem' }}>
            <div style={detailLabelStyle}>Photo</div>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              {photos.slice(0, 4).map((url) => (
                <a key={url} href={url} target="_blank" rel="noopener noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="Action issue" style={photoStyle} />
                </a>
              ))}
            </div>
          </div>
        ) : (
          <DetailRow label="Photo" value={display.hasPhoto ? 'Photo attached' : ''} />
        )}
      </section>

      <section style={sectionStyle}>
        <h3 style={sectionHeadingStyle}>Tracking</h3>
        <DetailRow label="Priority" value={display.priority} />
        <DetailRow label="Status" value={display.status} />
        <DetailRow label="Submitted by" value={display.submittedBy} />
        <DetailRow label="Inspection date" value={display.inspectionDate} />
        <DetailRow label="Assigned to" value={display.assignedTo} />
        <DetailRow label="Target completion date" value={display.targetCompletionDate} />
        {display.repairNotes ? <DetailRow label="Notes/update" value={display.repairNotes} multiline /> : null}
        {action.inspection_id ? (
          <Link href={`/inspections/${encodeURIComponent(action.inspection_id)}`} style={{ color: '#1d4ed8', fontWeight: 600 }}>
            Open inspection report
          </Link>
        ) : null}
      </section>

      <section style={sectionStyle}>
        <h3 style={sectionHeadingStyle}>Update action</h3>
        <Field label="Assigned to">
          <select value={form.recipient_person_id || ''} onChange={(e) => setField('recipient_person_id', e.target.value)} style={inputStyle}>
            <option value="">Not recorded</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {[person.name, person.email].filter(Boolean).join(' - ')}
              </option>
            ))}
          </select>
        </Field>
        <div style={editGridStyle}>
          <Field label="Status">
            <select value={form.status || 'open'} onChange={(e) => setField('status', e.target.value)} style={inputStyle}>
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Priority">
            <select value={form.priority || ''} onChange={(e) => setField('priority', e.target.value)} style={inputStyle}>
              {PRIORITY_OPTIONS.map((option) => (
                <option key={option || 'none'} value={option}>{option ? displayActionStatus(option) : 'Not recorded'}</option>
              ))}
            </select>
          </Field>
          <Field label="Target completion date">
            <input type="date" value={form.due_date || ''} onChange={(e) => setField('due_date', e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Job number">
            <input value={form.job_number || ''} onChange={(e) => setField('job_number', e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Expected completion date">
            <input type="date" value={form.expected_completion_date || ''} onChange={(e) => setField('expected_completion_date', e.target.value)} style={inputStyle} />
          </Field>
        </div>
        <Field label="Notes/update">
          <textarea value={form.repair_notes || ''} onChange={(e) => setField('repair_notes', e.target.value)} rows={5} style={textareaStyle} />
        </Field>
        {error ? <p style={{ margin: '0.75rem 0 0', color: '#b91c1c' }}>{error}</p> : null}
        {message ? <p style={{ margin: '0.75rem 0 0', color: '#166534' }}>{message}</p> : null}
        <button type="button" onClick={saveAction} disabled={saving} style={{ ...saveButtonStyle, background: saving ? '#94a3b8' : '#1d4ed8' }}>
          {saving ? 'Saving...' : 'Save action'}
        </button>
      </section>
    </aside>
  )
}

function DetailRow({ label, value, multiline = false }) {
  return (
    <div style={{ marginTop: '0.75rem' }}>
      <div style={detailLabelStyle}>{label}</div>
      <div style={{ color: '#111827', whiteSpace: multiline ? 'pre-wrap' : 'normal' }}>{notRecorded(value)}</div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'block', marginTop: '0.75rem' }}>
      <span style={detailLabelStyle}>{label}</span>
      {children}
    </label>
  )
}

const cardButtonStyle = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  background: '#fff',
  border: '1px solid #e5e7eb',
  borderRadius: '0.75rem',
  padding: '1rem',
  cursor: 'pointer',
}

const cardMetaGridStyle = {
  display: 'grid',
  gap: '0.25rem',
  marginTop: '0.45rem',
  color: '#334155',
  fontSize: '0.875rem',
}

const filterBannerStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '1rem',
  flexWrap: 'wrap',
  marginBottom: '1rem',
  padding: '0.85rem 1rem',
  background: '#ecfdf5',
  border: '1px solid #99f6e4',
  borderRadius: '0.75rem',
  color: '#134e4a',
}

const clearFilterLinkStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  border: '1px solid #0f766e',
  borderRadius: '0.5rem',
  padding: '0.45rem 0.7rem',
  color: '#0f766e',
  background: '#fff',
  textDecoration: 'none',
  fontWeight: 700,
  fontSize: '0.875rem',
}

const filterActionsStyle = {
  display: 'flex',
  gap: '0.5rem',
  flexWrap: 'wrap',
  alignItems: 'center',
}

const downloadPdfButtonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  border: '1px solid #0f766e',
  borderRadius: '0.5rem',
  padding: '0.45rem 0.7rem',
  color: '#fff',
  background: '#0f766e',
  fontWeight: 700,
  fontSize: '0.875rem',
}

const searchWrapStyle = {
  marginBottom: '1rem',
  background: '#fff',
  border: '1px solid #e5e7eb',
  borderRadius: '0.75rem',
  padding: '1rem',
  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.08)',
}

const emptySearchStyle = {
  background: '#fff',
  border: '1px dashed #cbd5e1',
  borderRadius: '0.75rem',
  padding: '1rem',
  color: '#64748b',
}

const statusBadgeStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  borderRadius: '999px',
  padding: '0.2rem 0.6rem',
  background: '#eff6ff',
  color: '#1d4ed8',
  fontSize: '0.8rem',
  fontWeight: 700,
}

const detailStyle = {
  position: 'sticky',
  top: 88,
  maxHeight: 'calc(100vh - 110px)',
  overflowY: 'auto',
  background: '#fff',
  border: '1px solid #dbe3ef',
  borderRadius: '0.75rem',
  padding: '1rem',
  boxShadow: '0 12px 30px rgba(15, 23, 42, 0.14)',
}

const sectionStyle = {
  borderTop: '1px solid #e5e7eb',
  paddingTop: '1rem',
  marginTop: '1rem',
}

const sectionHeadingStyle = {
  margin: 0,
  color: '#111827',
  fontSize: '1rem',
}

const detailLabelStyle = {
  display: 'block',
  marginBottom: '0.25rem',
  color: '#64748b',
  fontSize: '0.78rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}

const inputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  border: '1px solid #cbd5e1',
  borderRadius: '0.5rem',
  padding: '0.65rem',
  fontSize: '0.95rem',
  background: '#fff',
}

const textareaStyle = {
  ...inputStyle,
  fontFamily: 'inherit',
  resize: 'vertical',
}

const editGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
  gap: '0.75rem',
}

const photoStyle = {
  width: 130,
  height: 95,
  objectFit: 'cover',
  borderRadius: '0.5rem',
  border: '1px solid #cbd5e1',
}

const saveButtonStyle = {
  width: '100%',
  marginTop: '1rem',
  border: 'none',
  borderRadius: '0.5rem',
  padding: '0.8rem 1rem',
  color: '#fff',
  fontWeight: 700,
  cursor: 'pointer',
}

const closeButtonStyle = {
  border: '1px solid #cbd5e1',
  borderRadius: '0.5rem',
  background: '#fff',
  color: '#334155',
  padding: '0.45rem 0.7rem',
  fontWeight: 600,
  cursor: 'pointer',
}
