'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

const TAB_SUMMARY = 'summary'
const TAB_SCHEDULES = 'schedules'
const TAB_INSPECTIONS = 'inspections'

const AD_HOC_TYPES = [
  { value: 'ad_hoc_walkabout', label: 'Ad hoc walkabout' },
  { value: 'estate_walkabout', label: 'Estate walkabout' },
  { value: 'block_walkabout', label: 'Block walkabout' },
  { value: 'follow_up', label: 'Follow-up check' },
  { value: 'health_safety', label: 'Health & safety' },
  { value: 'other', label: 'Other' },
]

const FREQUENCIES = ['Weekly', 'Fortnightly', 'Monthly', 'Quarterly', 'Biannual', 'Annual']

function formatDate(value) {
  if (!value) return 'N/A'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return 'N/A'
  return d.toLocaleDateString('en-GB')
}

function parseTemplateVersion(value) {
  if (!value) return {}
  if (typeof value === 'object') return value
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return {}
    }
  }
  return {}
}

function getWorkflow(row) {
  if (row.is_scheduled === true) return 'scheduled'
  if (row.template_id) return 'template'
  return 'ad_hoc'
}

function statusBadge(status) {
  const v = (status || 'draft').toLowerCase()
  if (v === 'submitted') return { background: '#d1fae5', color: '#065f46' }
  if (v === 'scheduled') return { background: '#dbeafe', color: '#1d4ed8' }
  return { background: '#f3f4f6', color: '#6b7280' }
}

export default function InspectionsListPage() {
  const [inspections, setInspections] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState(TAB_INSPECTIONS)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [formError, setFormError] = useState(null)
  const [successMessage, setSuccessMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [options, setOptions] = useState({
    estates: [],
    blocks: [],
    people: [],
    templates: [],
    templateWarning: null,
    permissions: {
      canCreateAdHocInspection: false,
      canCreateScheduledInspection: true,
    },
  })
  const [filters, setFilters] = useState({
    query: '',
    workflow: 'all',
    status: 'all',
  })
  const [form, setForm] = useState({
    mode: 'ad_hoc',
    inspectionDate: '',
    dueDate: '',
    estateId: '',
    area: '',
    blockId: '',
    assignedPersonId: '',
    assignedPersonName: '',
    assignedPersonEmail: '',
    inspectionType: AD_HOC_TYPES[0].value,
    reason: '',
    notes: '',
    status: 'draft',
    templateId: '',
    templateName: '',
    frequency: FREQUENCIES[0],
    startDate: '',
    endDate: '',
  })

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [inspectionsRes, optionsRes] = await Promise.all([
        fetch('/api/inspections', { credentials: 'include', cache: 'no-store' }),
        fetch('/api/inspections/manage/options', { credentials: 'include', cache: 'no-store' }),
      ])

      const inspectionsData = await inspectionsRes.json().catch(() => ({}))
      if (!inspectionsRes.ok) {
        throw new Error(inspectionsData?.error || `Failed to load inspections (${inspectionsRes.status})`)
      }
      setInspections(Array.isArray(inspectionsData) ? inspectionsData : [])

      const optionsData = await optionsRes.json().catch(() => ({}))
      if (!optionsRes.ok) {
        throw new Error(optionsData?.error || `Failed to load inspection options (${optionsRes.status})`)
      }
      setOptions({
        estates: Array.isArray(optionsData?.estates) ? optionsData.estates : [],
        blocks: Array.isArray(optionsData?.blocks) ? optionsData.blocks : [],
        people: Array.isArray(optionsData?.people) ? optionsData.people : [],
        templates: Array.isArray(optionsData?.templates) ? optionsData.templates : [],
        templateWarning: optionsData?.templateWarning || null,
        permissions: {
          canCreateAdHocInspection: Boolean(optionsData?.permissions?.canCreateAdHocInspection),
          canCreateScheduledInspection:
            optionsData?.permissions?.canCreateScheduledInspection !== false,
        },
      })
    } catch (e) {
      setError(e?.message || 'Failed to load inspection management data')
      setInspections([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const rows = useMemo(() => {
    return inspections.map((row) => {
      const workflow = getWorkflow(row)
      const meta = parseTemplateVersion(row.template_version)
      const schedule = meta?.schedule || {}
      return {
        ...row,
        workflow,
        typeDisplay: workflow === 'scheduled' ? 'Scheduled' : workflow === 'ad_hoc' ? 'Ad hoc' : 'Template',
        locationDisplay: row.location_label || row.estate_name || row.block_name || 'N/A',
        userDisplay: row.inspector_name || row.inspector_id || 'N/A',
        templateDisplay: workflow === 'ad_hoc' ? 'N/A' : (row.template_name || 'N/A'),
        frequencyDisplay: workflow === 'scheduled' ? (schedule.frequency || 'N/A') : 'N/A',
        startDisplay: workflow === 'scheduled' ? (schedule.start_date || 'N/A') : 'N/A',
        endDisplay: workflow === 'scheduled' ? (schedule.end_date || 'N/A') : 'N/A',
      }
    })
  }, [inspections])

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (activeTab === TAB_SCHEDULES && row.workflow !== 'scheduled') return false
      if (filters.workflow !== 'all' && row.workflow !== filters.workflow) return false
      if (filters.status !== 'all' && (row.status || '').toLowerCase() !== filters.status.toLowerCase()) return false
      if (filters.query.trim()) {
        const q = filters.query.toLowerCase()
        const haystack = [
          row.typeDisplay,
          row.locationDisplay,
          row.userDisplay,
          row.templateDisplay,
          row.frequencyDisplay,
          row.title,
          row.description,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [rows, activeTab, filters])

  const summary = useMemo(() => {
    return {
      total: rows.length,
      scheduled: rows.filter((r) => r.workflow === 'scheduled').length,
      adHoc: rows.filter((r) => r.workflow === 'ad_hoc').length,
      template: rows.filter((r) => r.workflow === 'template').length,
    }
  }, [rows])

  const visibleBlocks = useMemo(() => {
    if (!form.estateId) return options.blocks
    return options.blocks.filter((b) => !b.estate_id || b.estate_id === form.estateId)
  }, [options.blocks, form.estateId])

  const canCreateAdHocInspection = Boolean(options.permissions?.canCreateAdHocInspection)
  const canCreateScheduledInspection = Boolean(options.permissions?.canCreateScheduledInspection)
  const canCreateAnyInspection = canCreateAdHocInspection || canCreateScheduledInspection

  useEffect(() => {
    if (form.mode === 'ad_hoc' && !canCreateAdHocInspection && canCreateScheduledInspection) {
      setForm((prev) => ({ ...prev, mode: 'scheduled' }))
    }
  }, [form.mode, canCreateAdHocInspection, canCreateScheduledInspection])

  function setField(name, value) {
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  function resetForm() {
    setForm({
      mode: canCreateAdHocInspection ? 'ad_hoc' : 'scheduled',
      inspectionDate: '',
      dueDate: '',
      estateId: '',
      area: '',
      blockId: '',
      assignedPersonId: '',
      assignedPersonName: '',
      assignedPersonEmail: '',
      inspectionType: AD_HOC_TYPES[0].value,
      reason: '',
      notes: '',
      status: 'draft',
      templateId: '',
      templateName: '',
      frequency: FREQUENCIES[0],
      startDate: '',
      endDate: '',
    })
    setFormError(null)
  }

  async function submitCreateInspection(event) {
    event.preventDefault()
    setSuccessMessage('')
    setFormError(null)
    if (form.mode === 'ad_hoc' && !canCreateAdHocInspection) {
      setFormError('Ad hoc inspection creation is not enabled for your account.')
      return
    }
    if (form.mode === 'scheduled' && !canCreateScheduledInspection) {
      setFormError('Scheduled inspection creation is not enabled for your account.')
      return
    }
    if (!form.area || !form.assignedPersonName) {
      setFormError('Area and assigned person are required.')
      return
    }

    const payload = {
      mode: form.mode,
      area: form.area,
      estate_id: form.estateId || null,
      block_id: form.blockId || null,
      assigned_person_id: form.assignedPersonId || null,
      assigned_person_name: form.assignedPersonName,
      assigned_person_email: form.assignedPersonEmail || null,
      reason: form.reason,
      notes: form.notes,
      status: form.status,
    }

    if (form.mode === 'ad_hoc') {
      if (!form.inspectionDate || !form.inspectionType || !form.reason) {
        setFormError('Date, inspection type, and reason are required for ad hoc inspections.')
        return
      }
      payload.inspection_date = form.inspectionDate
      payload.inspection_type = form.inspectionType
    } else {
      if (!form.templateId || !form.templateName || !form.frequency || !form.startDate || !form.dueDate) {
        setFormError('Template, frequency, start, and due date are required for scheduled inspections.')
        return
      }
      payload.template_id = form.templateId
      payload.template_name = form.templateName
      payload.frequency = form.frequency
      payload.start_date = form.startDate
      payload.end_date = form.endDate || null
      payload.due_date = form.dueDate
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/inspections/manage', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.error || data?.details || `Create failed (${res.status})`)
      }
      setSuccessMessage('Inspection created successfully.')
      setShowCreate(false)
      resetForm()
      await load()
    } catch (error) {
      setFormError(error?.message || 'Failed to create inspection')
    } finally {
      setSubmitting(false)
    }
  }

  function renderTable(tableRows) {
    if (tableRows.length === 0) {
      return <div style={{ padding: '1.5rem', color: '#6b7280', textAlign: 'center' }}>No inspections found.</div>
    }
    return (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
          <thead>
            <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              <th style={{ textAlign: 'left', padding: '0.75rem 1rem', fontWeight: 600, color: '#374151' }}>Type</th>
              <th style={{ textAlign: 'left', padding: '0.75rem 1rem', fontWeight: 600, color: '#374151' }}>Location</th>
              <th style={{ textAlign: 'left', padding: '0.75rem 1rem', fontWeight: 600, color: '#374151' }}>User</th>
              <th style={{ textAlign: 'left', padding: '0.75rem 1rem', fontWeight: 600, color: '#374151' }}>Template</th>
              <th style={{ textAlign: 'left', padding: '0.75rem 1rem', fontWeight: 600, color: '#374151' }}>Frequency</th>
              <th style={{ textAlign: 'left', padding: '0.75rem 1rem', fontWeight: 600, color: '#374151' }}>Start</th>
              <th style={{ textAlign: 'left', padding: '0.75rem 1rem', fontWeight: 600, color: '#374151' }}>End</th>
              <th style={{ textAlign: 'left', padding: '0.75rem 1rem', fontWeight: 600, color: '#374151' }}>Due</th>
              <th style={{ textAlign: 'left', padding: '0.75rem 1rem', fontWeight: 600, color: '#374151' }}>Status</th>
              <th style={{ textAlign: 'left', padding: '0.75rem 1rem', fontWeight: 600, color: '#374151' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {tableRows.map((row) => {
              const badge = statusBadge(row.status)
              return (
                <tr key={row.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '0.75rem 1rem', color: '#111827' }}>{row.typeDisplay}</td>
                  <td style={{ padding: '0.75rem 1rem', color: '#374151' }}>{row.locationDisplay}</td>
                  <td style={{ padding: '0.75rem 1rem', color: '#374151' }}>{row.userDisplay}</td>
                  <td style={{ padding: '0.75rem 1rem', color: '#374151' }}>{row.templateDisplay}</td>
                  <td style={{ padding: '0.75rem 1rem', color: '#374151' }}>{row.frequencyDisplay}</td>
                  <td style={{ padding: '0.75rem 1rem', color: '#374151' }}>{row.startDisplay}</td>
                  <td style={{ padding: '0.75rem 1rem', color: '#374151' }}>{row.endDisplay}</td>
                  <td style={{ padding: '0.75rem 1rem', color: '#374151' }}>{formatDate(row.due_date)}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <span style={{ padding: '0.2rem 0.5rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 500, backgroundColor: badge.background, color: badge.color }}>
                      {row.status || 'draft'}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <Link href={`/inspections/${row.id}`} style={{ color: '#0f766e', textDecoration: 'none', fontWeight: 600 }}>
                      View
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div>
      <h1 style={{ margin: 0, fontSize: '1.9rem', fontWeight: 'bold', color: '#111827' }}>Manage Inspections</h1>
      <p style={{ margin: '0.4rem 0 1rem', color: '#6b7280' }}>
        Create and manage inspection records. Ad hoc inspections are created directly here.
      </p>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <button
          type="button"
          disabled={!canCreateAnyInspection}
          onClick={() => {
            setShowCreate((prev) => !prev)
            setFormError(null)
            setSuccessMessage('')
          }}
          style={{
            padding: '0.75rem 1.1rem',
            backgroundColor: canCreateAnyInspection ? '#0f766e' : '#9ca3af',
            color: '#fff',
            border: 'none',
            borderRadius: '0.5rem',
            fontWeight: 600,
            cursor: canCreateAnyInspection ? 'pointer' : 'not-allowed',
          }}
        >
          {showCreate ? 'Close Create Inspection' : 'Create Inspection'}
        </button>
        <button
          type="button"
          onClick={() => setFiltersOpen((prev) => !prev)}
          style={{ padding: '0.7rem 1rem', borderRadius: '0.5rem', border: '1px solid #fca5a5', backgroundColor: '#fff', color: '#7f1d1d', cursor: 'pointer' }}
        >
          {filtersOpen ? 'Hide Filters' : 'Show Filters'}
        </button>
      </div>
      {!canCreateAdHocInspection && (
        <div style={{ marginBottom: '1rem', color: '#7f1d1d', fontSize: '0.9rem' }}>
          Ad hoc inspection creation is currently disabled for your account. A manager can enable it in
          Airtable Users via <strong>Can Create Ad Hoc Inspection</strong>.
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <button type="button" onClick={() => setActiveTab(TAB_SUMMARY)} style={{ padding: '0.65rem 0.95rem', borderRadius: '0.4rem', border: activeTab === TAB_SUMMARY ? '1px solid #111827' : '1px solid #e5e7eb', backgroundColor: activeTab === TAB_SUMMARY ? '#f3f4f6' : '#fff', cursor: 'pointer' }}>Summary</button>
        <button type="button" onClick={() => setActiveTab(TAB_SCHEDULES)} style={{ padding: '0.65rem 0.95rem', borderRadius: '0.4rem', border: activeTab === TAB_SCHEDULES ? '1px solid #111827' : '1px solid #e5e7eb', backgroundColor: activeTab === TAB_SCHEDULES ? '#f3f4f6' : '#fff', cursor: 'pointer' }}>Manage Schedules</button>
        <button type="button" onClick={() => setActiveTab(TAB_INSPECTIONS)} style={{ padding: '0.65rem 0.95rem', borderRadius: '0.4rem', border: activeTab === TAB_INSPECTIONS ? '1px solid #111827' : '1px solid #e5e7eb', backgroundColor: activeTab === TAB_INSPECTIONS ? '#f3f4f6' : '#fff', cursor: 'pointer' }}>Manage Inspections</button>
      </div>

      {showCreate && (
        <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '0.5rem', padding: '1.25rem', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              disabled={!canCreateAdHocInspection}
              onClick={() => setField('mode', 'ad_hoc')}
              style={{
                padding: '0.6rem 1rem',
                borderRadius: '0.4rem',
                border: form.mode === 'ad_hoc' ? '1px solid #0f766e' : '1px solid #d1d5db',
                backgroundColor: form.mode === 'ad_hoc' ? '#ecfdf5' : '#fff',
                color: canCreateAdHocInspection ? '#065f46' : '#9ca3af',
                fontWeight: 600,
                cursor: canCreateAdHocInspection ? 'pointer' : 'not-allowed',
              }}
            >
              Ad hoc inspection
            </button>
            <button
              type="button"
              disabled={!canCreateScheduledInspection}
              onClick={() => setField('mode', 'scheduled')}
              style={{
                padding: '0.6rem 1rem',
                borderRadius: '0.4rem',
                border: form.mode === 'scheduled' ? '1px solid #1d4ed8' : '1px solid #d1d5db',
                backgroundColor: form.mode === 'scheduled' ? '#eff6ff' : '#fff',
                color: canCreateScheduledInspection ? '#1d4ed8' : '#9ca3af',
                fontWeight: 600,
                cursor: canCreateScheduledInspection ? 'pointer' : 'not-allowed',
              }}
            >
              Scheduled inspection
            </button>
            <Link href="/inspections/new/template" style={{ marginLeft: 'auto', padding: '0.6rem 1rem', borderRadius: '0.4rem', border: '1px solid #0f766e', color: '#0f766e', textDecoration: 'none', fontWeight: 600 }}>Complete Template Inspection</Link>
          </div>
          {!canCreateAdHocInspection && (
            <div style={{ marginBottom: '0.75rem', color: '#7f1d1d', fontSize: '0.9rem' }}>
              Ad hoc creation is disabled for your user. Scheduled inspection creation remains available.
            </div>
          )}

          {options.templateWarning && form.mode === 'scheduled' && <div style={{ marginBottom: '0.75rem', color: '#92400e' }}>{options.templateWarning}</div>}
          {formError && <div style={{ marginBottom: '0.75rem', color: '#991b1b' }}>{formError}</div>}
          {successMessage && <div style={{ marginBottom: '0.75rem', color: '#065f46' }}>{successMessage}</div>}

          <form onSubmit={submitCreateInspection}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.9rem' }}>
              {form.mode === 'ad_hoc' ? (
                <>
                  <div>
                    <label htmlFor="inspection_date" style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>Date *</label>
                    <input id="inspection_date" type="date" value={form.inspectionDate} onChange={(e) => setField('inspectionDate', e.target.value)} required style={{ width: '100%', padding: '0.65rem', border: '1px solid #d1d5db', borderRadius: '0.4rem' }} />
                  </div>
                  <div>
                    <label htmlFor="inspection_type" style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>Inspection type *</label>
                    <select id="inspection_type" value={form.inspectionType} onChange={(e) => setField('inspectionType', e.target.value)} required style={{ width: '100%', padding: '0.65rem', border: '1px solid #d1d5db', borderRadius: '0.4rem' }}>
                      {AD_HOC_TYPES.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label htmlFor="template_id" style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>Template *</label>
                    <select id="template_id" value={form.templateId} onChange={(e) => { const nextId = e.target.value; const selected = options.templates.find((t) => t.id === nextId); setField('templateId', nextId); setField('templateName', selected?.name || '') }} required style={{ width: '100%', padding: '0.65rem', border: '1px solid #d1d5db', borderRadius: '0.4rem' }}>
                      <option value="">Select template</option>
                      {options.templates.map((template) => (
                        <option key={template.id} value={template.id}>{template.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="frequency" style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>Frequency *</label>
                    <select id="frequency" value={form.frequency} onChange={(e) => setField('frequency', e.target.value)} required style={{ width: '100%', padding: '0.65rem', border: '1px solid #d1d5db', borderRadius: '0.4rem' }}>
                      {FREQUENCIES.map((frequency) => (
                        <option key={frequency} value={frequency}>{frequency}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="start_date" style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>Start *</label>
                    <input id="start_date" type="date" value={form.startDate} onChange={(e) => setField('startDate', e.target.value)} required style={{ width: '100%', padding: '0.65rem', border: '1px solid #d1d5db', borderRadius: '0.4rem' }} />
                  </div>
                  <div>
                    <label htmlFor="end_date" style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>End</label>
                    <input id="end_date" type="date" value={form.endDate} onChange={(e) => setField('endDate', e.target.value)} style={{ width: '100%', padding: '0.65rem', border: '1px solid #d1d5db', borderRadius: '0.4rem' }} />
                  </div>
                  <div>
                    <label htmlFor="due_date" style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>Due *</label>
                    <input id="due_date" type="date" value={form.dueDate} onChange={(e) => setField('dueDate', e.target.value)} required style={{ width: '100%', padding: '0.65rem', border: '1px solid #d1d5db', borderRadius: '0.4rem' }} />
                  </div>
                </>
              )}

              <div>
                <label htmlFor="estate_id" style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>Estate</label>
                <select id="estate_id" value={form.estateId} onChange={(e) => { setField('estateId', e.target.value); setField('blockId', '') }} style={{ width: '100%', padding: '0.65rem', border: '1px solid #d1d5db', borderRadius: '0.4rem' }}>
                  <option value="">Select estate (optional)</option>
                  {options.estates.map((estate) => (
                    <option key={estate.id} value={estate.id}>{estate.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="block_id" style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>Block</label>
                <select id="block_id" value={form.blockId} onChange={(e) => setField('blockId', e.target.value)} style={{ width: '100%', padding: '0.65rem', border: '1px solid #d1d5db', borderRadius: '0.4rem' }}>
                  <option value="">Select block (optional)</option>
                  {visibleBlocks.map((block) => (
                    <option key={block.id} value={block.id}>{block.name}{block.estate_name ? ` (${block.estate_name})` : ''}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="assigned_person_id" style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>Assigned person (directory)</label>
                <select id="assigned_person_id" value={form.assignedPersonId} onChange={(e) => { const nextId = e.target.value; const person = options.people.find((p) => p.id === nextId); setField('assignedPersonId', nextId); if (person) { setField('assignedPersonName', person.name || ''); setField('assignedPersonEmail', person.email || '') } }} style={{ width: '100%', padding: '0.65rem', border: '1px solid #d1d5db', borderRadius: '0.4rem' }}>
                  <option value="">Select person (optional)</option>
                  {options.people.map((person) => (
                    <option key={person.id} value={person.id}>{person.name}{person.email ? ` (${person.email})` : ''}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="assigned_person_name" style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>Assigned person *</label>
                <input id="assigned_person_name" value={form.assignedPersonName} onChange={(e) => setField('assignedPersonName', e.target.value)} required style={{ width: '100%', padding: '0.65rem', border: '1px solid #d1d5db', borderRadius: '0.4rem' }} />
              </div>
              <div>
                <label htmlFor="assigned_person_email" style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>Assigned person email</label>
                <input id="assigned_person_email" type="email" value={form.assignedPersonEmail} onChange={(e) => setField('assignedPersonEmail', e.target.value)} style={{ width: '100%', padding: '0.65rem', border: '1px solid #d1d5db', borderRadius: '0.4rem' }} />
              </div>
              <div>
                <label htmlFor="status" style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>Status *</label>
                <select id="status" value={form.status} onChange={(e) => setField('status', e.target.value)} required style={{ width: '100%', padding: '0.65rem', border: '1px solid #d1d5db', borderRadius: '0.4rem' }}>
                  {(form.mode === 'scheduled' ? ['scheduled', 'draft', 'submitted'] : ['draft', 'submitted']).map((status) => (
                    <option key={status} value={status}>{status.charAt(0).toUpperCase() + status.slice(1)}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ marginTop: '0.9rem' }}>
              <label htmlFor="area" style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>Estate / area *</label>
              <input id="area" value={form.area} onChange={(e) => setField('area', e.target.value)} required placeholder="e.g. Bernay Road - Entrance and stairwell" style={{ width: '100%', padding: '0.65rem', border: '1px solid #d1d5db', borderRadius: '0.4rem' }} />
            </div>
            <div style={{ marginTop: '0.9rem' }}>
              <label htmlFor="reason" style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>Reason {form.mode === 'ad_hoc' ? '*' : '(optional)'}</label>
              <input id="reason" value={form.reason} onChange={(e) => setField('reason', e.target.value)} required={form.mode === 'ad_hoc'} placeholder={form.mode === 'ad_hoc' ? 'Why this ad hoc inspection is being created' : 'Optional schedule reason'} style={{ width: '100%', padding: '0.65rem', border: '1px solid #d1d5db', borderRadius: '0.4rem' }} />
            </div>
            <div style={{ marginTop: '0.9rem' }}>
              <label htmlFor="notes" style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>Notes</label>
              <textarea id="notes" value={form.notes} onChange={(e) => setField('notes', e.target.value)} rows={3} style={{ width: '100%', padding: '0.65rem', border: '1px solid #d1d5db', borderRadius: '0.4rem', resize: 'vertical' }} />
            </div>
            <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button type="button" onClick={() => { setShowCreate(false); resetForm() }} style={{ padding: '0.65rem 1rem', borderRadius: '0.4rem', border: '1px solid #d1d5db', backgroundColor: '#fff', color: '#374151', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
              <button type="submit" disabled={submitting} style={{ padding: '0.65rem 1rem', borderRadius: '0.4rem', border: 'none', backgroundColor: submitting ? '#9ca3af' : '#0f766e', color: '#fff', fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer' }}>{submitting ? 'Creating…' : 'Create Inspection'}</button>
            </div>
          </form>
        </div>
      )}

      {filtersOpen && (
        <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '0.5rem', padding: '1rem', marginBottom: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
            <div>
              <label htmlFor="query" style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>Search</label>
              <input id="query" value={filters.query} onChange={(e) => setFilters((prev) => ({ ...prev, query: e.target.value }))} placeholder="Type, location, user, template…" style={{ width: '100%', padding: '0.6rem', border: '1px solid #d1d5db', borderRadius: '0.4rem' }} />
            </div>
            <div>
              <label htmlFor="workflow" style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>Workflow</label>
              <select id="workflow" value={filters.workflow} onChange={(e) => setFilters((prev) => ({ ...prev, workflow: e.target.value }))} style={{ width: '100%', padding: '0.6rem', border: '1px solid #d1d5db', borderRadius: '0.4rem' }}>
                <option value="all">All</option>
                <option value="scheduled">Scheduled</option>
                <option value="ad_hoc">Ad hoc</option>
                <option value="template">Template</option>
              </select>
            </div>
            <div>
              <label htmlFor="status_filter" style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>Status</label>
              <select id="status_filter" value={filters.status} onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))} style={{ width: '100%', padding: '0.6rem', border: '1px solid #d1d5db', borderRadius: '0.4rem' }}>
                <option value="all">All</option>
                <option value="draft">Draft</option>
                <option value="scheduled">Scheduled</option>
                <option value="submitted">Submitted</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div style={{ padding: '1rem 1.25rem', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.5rem', marginBottom: '1rem', color: '#991b1b', fontSize: '0.9375rem' }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>Loading inspections…</div>
      ) : (
        <div style={{ backgroundColor: '#fff', borderRadius: '0.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
          {activeTab === TAB_SUMMARY ? (
            <div style={{ padding: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
                <div style={{ padding: '0.75rem', border: '1px solid #e5e7eb', borderRadius: '0.5rem' }}><div style={{ fontSize: '0.8rem', color: '#6b7280' }}>Total</div><div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{summary.total}</div></div>
                <div style={{ padding: '0.75rem', border: '1px solid #e5e7eb', borderRadius: '0.5rem' }}><div style={{ fontSize: '0.8rem', color: '#6b7280' }}>Scheduled</div><div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{summary.scheduled}</div></div>
                <div style={{ padding: '0.75rem', border: '1px solid #e5e7eb', borderRadius: '0.5rem' }}><div style={{ fontSize: '0.8rem', color: '#6b7280' }}>Ad hoc</div><div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{summary.adHoc}</div></div>
                <div style={{ padding: '0.75rem', border: '1px solid #e5e7eb', borderRadius: '0.5rem' }}><div style={{ fontSize: '0.8rem', color: '#6b7280' }}>Template-based</div><div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{summary.template}</div></div>
              </div>
              {renderTable(filteredRows.slice(0, 12))}
            </div>
          ) : (
            renderTable(filteredRows)
          )}
        </div>
      )}
    </div>
  )
}
