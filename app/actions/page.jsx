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

function includesFilter(values, filter) {
  const needle = filter.trim().toLowerCase()
  if (!needle) return true
  return values.some((value) => String(value || '').toLowerCase().includes(needle))
}

function uniqueDisplayOptions(values) {
  const options = []
  const seen = new Set()
  values.forEach((value) => {
    const label = cleanActionDisplayText(value)
    const key = label.toLowerCase()
    if (!label || seen.has(key)) return
    seen.add(key)
    options.push(label)
  })
  return options.sort((a, b) => a.localeCompare(b))
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
  const [filters, setFilters] = useState({
    dateFrom: '',
    dateTo: '',
    location: '',
    person: '',
  })

  const filteredActions = useMemo(() => {
    return actions.filter((action) => {
      const display = buildActionDisplay(action)

      // Date filter
      if (filters.dateFrom || filters.dateTo) {
        const actionDate = new Date(action.inspection_submitted_at || action.inspection_created_at || action.created_at)
        if (Number.isNaN(actionDate.getTime())) return false
        
        if (filters.dateFrom) {
          const fromDate = new Date(filters.dateFrom)
          if (actionDate < fromDate) return false
        }
        
        if (filters.dateTo) {
          const toDate = new Date(filters.dateTo)
          toDate.setHours(23, 59, 59, 999) // End of day
          if (actionDate > toDate) return false
        }
      }
      
      // Location filter
      if (filters.location) {
        const locationMatch = includesFilter([
          display.contextLocation,
          display.location,
          display.blockLocation,
          action.estate_block_name,
          action.estate_name,
          action.block_name,
          action.location,
          action.inspection_location_label,
          action.inspection_address,
          action.inspection_location,
        ], filters.location)
        if (!locationMatch) return false
      }
      
      // Person filter (assigned or completed by)
      if (filters.person) {
        const personMatch = includesFilter([
          display.assignedTo,
          display.completedBy,
          display.submittedBy,
          action.assigned_to,
          action.assigned_to_email,
          action.created_by,
          action.inspection_created_by_name,
          action.inspection_completed_by_name,
          action.inspection_inspector_name,
          action.completed_by,
          action.submitted_by,
        ], filters.person)
        if (!personMatch) return false
      }
      
      return true
    })
  }, [actions, filters])

  const locationFilterOptions = useMemo(() => {
    return uniqueDisplayOptions(actions.flatMap((action) => {
      const display = buildActionDisplay(action)
      return [
        display.contextLocation,
        display.location,
        display.blockLocation,
        action.estate_block_name,
        action.estate_name,
        action.block_name,
        action.location,
        action.inspection_location_label,
        action.inspection_address,
        action.inspection_location,
      ]
    }))
  }, [actions])

  const personFilterOptions = useMemo(() => {
    return uniqueDisplayOptions(actions.flatMap((action) => {
      const display = buildActionDisplay(action)
      return [
        display.assignedTo,
        display.completedBy,
        display.submittedBy,
        action.assigned_to,
        action.assigned_to_email,
        action.created_by,
        action.inspection_created_by_name,
        action.inspection_completed_by_name,
        action.inspection_inspector_name,
        action.completed_by,
        action.submitted_by,
      ]
    }))
  }, [actions])

  const selectedAction = filteredActions.find((action) => action.id === selectedId) || null

  useEffect(() => {
    if (!selectedId) return
    if (filteredActions.some((action) => action.id === selectedId)) return
    setSelectedId(filteredActions[0]?.id || '')
  }, [filteredActions, selectedId])

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

      <div style={filtersWrapStyle}>
        <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.125rem', fontWeight: 'bold', color: '#111827' }}>
          Filter Issues
        </h3>
        
        <div style={filtersGridStyle}>
          <div style={filterGroupStyle}>
            <label htmlFor="date-from" style={filterLabelStyle}>
              Inspection Date From
            </label>
            <input
              id="date-from"
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
              style={filterInputStyle}
            />
          </div>
          
          <div style={filterGroupStyle}>
            <label htmlFor="date-to" style={filterLabelStyle}>
              Inspection Date To
            </label>
            <input
              id="date-to"
              type="date"
              value={filters.dateTo}
              onChange={(e) => setFilters(prev => ({ ...prev, dateTo: e.target.value }))}
              style={filterInputStyle}
            />
          </div>
          
          <div style={filterGroupStyle}>
            <label htmlFor="location-filter" style={filterLabelStyle}>
              Estate/Block/Location
            </label>
            <input
              id="location-filter"
              type="text"
              list="location-filter-options"
              value={filters.location}
              onChange={(e) => setFilters(prev => ({ ...prev, location: e.target.value }))}
              placeholder="Type to filter locations..."
              style={filterInputStyle}
            />
            <datalist id="location-filter-options">
              {locationFilterOptions.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </div>
          
          <div style={filterGroupStyle}>
            <label htmlFor="person-filter" style={filterLabelStyle}>
              Assigned/Completed By
            </label>
            <input
              id="person-filter"
              type="text"
              list="person-filter-options"
              value={filters.person}
              onChange={(e) => setFilters(prev => ({ ...prev, person: e.target.value }))}
              placeholder="Type to filter people..."
              style={filterInputStyle}
            />
            <datalist id="person-filter-options">
              {personFilterOptions.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </div>
        </div>
        
        {(filters.dateFrom || filters.dateTo || filters.location || filters.person) && (
          <div style={activeFiltersStyle}>
            <span style={{ fontWeight: 600, color: '#374151' }}>Active filters:</span>
            {filters.dateFrom && <span style={filterTagStyle}>From: {new Date(filters.dateFrom).toLocaleDateString()}</span>}
            {filters.dateTo && <span style={filterTagStyle}>To: {new Date(filters.dateTo).toLocaleDateString()}</span>}
            {filters.location && <span style={filterTagStyle}>Location: {filters.location}</span>}
            {filters.person && <span style={filterTagStyle}>Person: {filters.person}</span>}
            <button
              type="button"
              onClick={() => setFilters({ dateFrom: '', dateTo: '', location: '', person: '' })}
              style={clearFiltersButtonStyle}
            >
              Clear all
            </button>
          </div>
        )}
        
        <p style={{ margin: '1rem 0 0', color: '#64748b', fontSize: '0.875rem' }}>
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
                No issues match your filters.
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
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                    <div>
                      <div style={cardEyebrowStyle}>{notRecorded(display.inspectionTemplateName)}</div>
                      <strong style={{ color: '#111827', fontSize: '1rem' }}>{notRecorded(display.contextLocation)}</strong>
                    </div>
                    <span style={statusBadgeStyle}>{display.status}</span>
                  </div>
                  <div style={inspectionContextGridStyle}>
                    <ContextItem label="Completed by" value={display.completedBy} />
                    <ContextItem label="Inspection date" value={display.inspectionDate} />
                  </div>
                  <div style={{ marginTop: '0.75rem', color: '#111827', fontSize: '0.95rem', fontWeight: 700 }}>
                    {notRecorded(display.issue || display.comment)}
                  </div>
                  <div style={cardMetaGridStyle}>
                    <span><strong>Section/category:</strong> {notRecorded(display.section)}</span>
                    <span><strong>Question/comment:</strong> {notRecorded(display.comment || display.issue)}</span>
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

          {selectedAction ? (
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
        <h3 style={sectionHeadingStyle}>Inspection context</h3>
        <DetailRow label="Form/template" value={display.inspectionTemplateName} />
        <DetailRow label="Completed by" value={display.completedBy} />
        <DetailRow label="Estate/block/location" value={display.contextLocation} />
        <DetailRow label="Inspection date" value={display.inspectionDate} />
      </section>

      <section style={sectionStyle}>
        <h3 style={sectionHeadingStyle}>Issue</h3>
        <DetailRow label="Section/category" value={display.section} />
        <DetailRow label="Issue/question summary" value={display.issue} />
        {display.rating ? <DetailRow label="Rating" value={display.rating} /> : null}
        <DetailRow label="Comment" value={display.comment} multiline />
        <DetailRow label="Estate/block/location" value={display.contextLocation} />
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

function ContextItem({ label, value }) {
  return (
    <div>
      <span style={contextLabelStyle}>{label}</span>
      <span style={contextValueStyle}>{notRecorded(value)}</span>
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

const cardEyebrowStyle = {
  marginBottom: '0.25rem',
  color: '#1d4ed8',
  fontSize: '0.78rem',
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}

const inspectionContextGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
  gap: '0.5rem',
  marginTop: '0.75rem',
  padding: '0.75rem',
  borderRadius: '0.65rem',
  background: '#f8fafc',
  border: '1px solid #e2e8f0',
}

const contextLabelStyle = {
  display: 'block',
  marginBottom: '0.15rem',
  color: '#64748b',
  fontSize: '0.72rem',
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}

const contextValueStyle = {
  display: 'block',
  color: '#0f172a',
  fontSize: '0.875rem',
  fontWeight: 600,
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

const filtersWrapStyle = {
  marginBottom: '1rem',
  background: '#fff',
  border: '1px solid #e5e7eb',
  borderRadius: '0.75rem',
  padding: '1rem',
  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.08)',
}

const filtersGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
  gap: '1rem',
  marginBottom: '1rem',
}

const filterGroupStyle = {
  display: 'flex',
  flexDirection: 'column',
}

const filterLabelStyle = {
  display: 'block',
  fontWeight: 600,
  color: '#374151',
  marginBottom: '0.5rem',
  fontSize: '0.875rem',
}

const filterInputStyle = {
  border: '1px solid #d1d5db',
  borderRadius: '0.375rem',
  padding: '0.5rem 0.75rem',
  fontSize: '0.875rem',
  color: '#374151',
  backgroundColor: '#fff',
}

const filterSelectStyle = {
  border: '1px solid #d1d5db',
  borderRadius: '0.375rem',
  padding: '0.5rem 0.75rem',
  fontSize: '0.875rem',
  color: '#374151',
  backgroundColor: '#fff',
  cursor: 'pointer',
}

const activeFiltersStyle = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.5rem',
  alignItems: 'center',
  marginBottom: '0.5rem',
  padding: '0.75rem',
  backgroundColor: '#f8fafc',
  borderRadius: '0.5rem',
  border: '1px solid #e2e8f0',
}

const filterTagStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  backgroundColor: '#dbeafe',
  color: '#1e40af',
  padding: '0.25rem 0.5rem',
  borderRadius: '0.25rem',
  fontSize: '0.75rem',
  fontWeight: 600,
}

const clearFiltersButtonStyle = {
  border: '1px solid #d1d5db',
  borderRadius: '0.375rem',
  backgroundColor: '#fff',
  color: '#374151',
  padding: '0.25rem 0.5rem',
  fontSize: '0.75rem',
  fontWeight: 600,
  cursor: 'pointer',
  marginLeft: 'auto',
}
