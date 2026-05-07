'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'

const STATUS_OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'closed', label: 'Closed' },
]

const PRIORITY_OPTIONS = ['', 'low', 'medium', 'high', 'urgent']

function parsePhotoUrls(raw) {
  if (Array.isArray(raw)) return raw.filter((url) => typeof url === 'string' && url.trim())
  if (typeof raw === 'string' && raw.trim()) {
    try {
      return parsePhotoUrls(JSON.parse(raw))
    } catch {
      return raw.startsWith('http') ? [raw] : []
    }
  }
  return []
}

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

function displayStatus(value) {
  const status = String(value || 'open').replace(/[_-]+/g, ' ')
  return status.replace(/\b\w/g, (char) => char.toUpperCase())
}

function actionSource(action) {
  return action.inspection_template_name || action.inspection_source || action.inspection_type || action.category
}

function actionInspectionDate(action) {
  return action.inspection_submitted_at || action.inspection_created_at || action.created_at || action.inspection_due_date
}

function actionSearchText(action) {
  return [
    action.estate_block_name,
    action.estate_name,
    action.block_name,
    action.inspection_location_label,
    action.location,
    action.title,
    action.description,
    action.comment,
    action.repair_notes,
    action.status,
    displayStatus(action.status),
    action.assigned_to,
    action.assigned_to_email,
    action.job_number,
    action.inspection_title,
    actionSource(action),
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

  const formatDate = (dateString) => {
    if (!dateString) return 'Not recorded'
    const date = new Date(dateString)
    if (Number.isNaN(date.getTime())) return 'Not recorded'
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatShortDate = (dateString) => {
    if (!dateString) return 'Not recorded'
    const date = new Date(dateString)
    if (Number.isNaN(date.getTime())) return 'Not recorded'
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  }

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
  const inspectionFilterAction = actions[0]
  const inspectionFilterLabel = inspectionFilterAction
    ? [
        inspectionFilterAction.estate_block_name,
        inspectionFilterAction.inspection_location_label || inspectionFilterAction.location,
        formatShortDate(actionInspectionDate(inspectionFilterAction)),
      ].filter(Boolean).join(' - ')
    : inspectionId

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
            <strong>Showing issues for inspection:</strong> {inspectionFilterLabel || inspectionId}
          </div>
          <Link href="/actions" style={clearFilterLinkStyle}>
            Clear filter
          </Link>
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
            {filteredActions.map((a) => (
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
                  <strong style={{ color: '#111827', fontSize: '1rem' }}>{notRecorded(a.title || a.description || a.comment)}</strong>
                  <span style={statusBadgeStyle}>{displayStatus(a.status)}</span>
                </div>
                <div style={{ marginTop: '0.5rem', color: '#64748b', fontSize: '0.875rem' }}>
                  {notRecorded(a.estate_block_name)}
                </div>
                <div style={cardMetaGridStyle}>
                  <span><strong>Location:</strong> {notRecorded(a.inspection_location_label || a.location)}</span>
                  <span><strong>Inspection date:</strong> {formatShortDate(actionInspectionDate(a))}</span>
                  <span><strong>Form/source:</strong> {notRecorded(actionSource(a))}</span>
                </div>
                <div style={{ marginTop: '0.35rem', color: '#334155', fontSize: '0.875rem' }}>
                  Assigned: {notRecorded(a.assigned_to)} | Priority: {notRecorded(a.priority)}
                  {a.job_number ? ` | Job: ${a.job_number}` : ''}
                </div>
              </button>
            ))}
          </div>

          {selectedAction && selectedActionVisible ? (
            <ActionDetail
              action={selectedAction}
              form={form}
              people={people}
              formatDate={formatDate}
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

function ActionDetail({ action, form, people, formatDate, setField, saveAction, saving, error, message, onClose }) {
  const photos = [...parsePhotoUrls(action.repair_photo_url), ...parsePhotoUrls(action.photo_urls)]
  const source = actionSource(action)

  return (
    <aside style={detailStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start' }}>
        <div>
          <p style={{ margin: '0 0 0.35rem', color: '#64748b', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Action detail
          </p>
          <h2 style={{ margin: 0, color: '#111827', fontSize: '1.35rem' }}>
            {notRecorded(action.title || action.description || action.comment)}
          </h2>
        </div>
        <button type="button" onClick={onClose} style={closeButtonStyle}>Close</button>
      </div>

      <section style={sectionStyle}>
        <h3 style={sectionHeadingStyle}>Issue</h3>
        <DetailRow label="Category/form source" value={source} />
        <DetailRow label="Estate/block" value={action.estate_block_name} />
        <DetailRow label="Location" value={action.inspection_location_label || action.location} />
        <DetailRow label="Issue/question title" value={action.title || action.question_id} />
        <DetailRow label="Full issue description/comment" value={[action.description, action.comment].filter(Boolean).join('\n\n')} multiline />
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
          <DetailRow label="Photo" value="" />
        )}
      </section>

      <section style={sectionStyle}>
        <h3 style={sectionHeadingStyle}>Tracking</h3>
        <DetailRow label="Created by" value={action.created_by} />
        <DetailRow label="Raised date" value={formatDate(action.created_at)} />
        <DetailRow label="Assigned to" value={action.assigned_to} />
        <DetailRow label="Target completion date" value={action.expected_completion_date || action.inspection_due_date ? formatDate(action.expected_completion_date || action.inspection_due_date) : ''} />
        <DetailRow label="Inspection ID" value={action.inspection_id} />
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
                <option key={option || 'none'} value={option}>{option ? displayStatus(option) : 'Not recorded'}</option>
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
