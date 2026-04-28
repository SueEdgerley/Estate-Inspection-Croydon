'use client'

import { useEffect, useState } from 'react'

const DAYS = [
  ['1', 'Monday'],
  ['2', 'Tuesday'],
  ['3', 'Wednesday'],
  ['4', 'Thursday'],
  ['5', 'Friday'],
  ['6', 'Saturday'],
  ['0', 'Sunday'],
]

export default function CaretakerSchedulesPage() {
  const [schedules, setSchedules] = useState([])
  const [people, setPeople] = useState([])
  const [estates, setEstates] = useState([])
  const [blocks, setBlocks] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [form, setForm] = useState({
    caretaker_person_id: '',
    estate_id: '',
    block_id: '',
    template_id: '',
    template_name: 'Caretaker Inspection',
    day_of_week: '1',
    frequency: 'weekly',
    active: true,
  })

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [s, p, e, b] = await Promise.all([
        fetch('/api/admin/caretaker-schedules', { credentials: 'include' }).then((r) => r.json()),
        fetch('/api/admin/staff-people', { credentials: 'include' }).then((r) => r.json()),
        fetch('/api/admin/estates', { credentials: 'include' }).then((r) => r.json()),
        fetch('/api/admin/blocks', { credentials: 'include' }).then((r) => r.json()),
      ])
      if (Array.isArray(s)) setSchedules(s)
      if (Array.isArray(p)) setPeople(p)
      if (Array.isArray(e)) setEstates(e)
      if (Array.isArray(b)) setBlocks(b)
    } catch (e) {
      setError(e?.message || 'Failed to load schedules')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const res = await fetch('/api/admin/caretaker-schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create schedule')
      setSchedules((prev) => [data, ...prev])
      setMessage('Schedule added.')
    } catch (e) {
      setError(e?.message || 'Failed to create schedule')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(schedule) {
    const res = await fetch(`/api/admin/caretaker-schedules/${schedule.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ active: !schedule.active }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error || 'Failed to update schedule')
      return
    }
    setSchedules((prev) => prev.map((s) => (s.id === schedule.id ? { ...s, ...data } : s)))
  }

  async function generateDueWork() {
    setError('')
    setMessage('')
    const res = await fetch('/api/admin/caretaker-schedules/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ due_date: new Date().toISOString().slice(0, 10) }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error || 'Failed to generate due work')
      return
    }
    setMessage(`Generated ${data.created} due item(s). Skipped ${data.skipped} existing item(s).`)
  }

  const caretakerPeople = people.filter((p) => {
    const label = String(p.job_title || '').toLowerCase()
    return p.active !== false && label.includes('caretaker')
  })

  if (loading) return <p>Loading...</p>

  return (
    <div style={{ maxWidth: 1100 }}>
      <h1>Caretaker Recurring Schedules</h1>
      <p>Recurring operational schedules apply to caretakers only. ESM and Housing Officer work remains separate reporting activity.</p>
      {error && <p style={{ color: '#b91c1c' }}>{error}</p>}
      {message && <p style={{ color: '#166534' }}>{message}</p>}

      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '0.75rem', margin: '1rem 0 2rem' }}>
        <select value={form.caretaker_person_id} onChange={(e) => setForm((f) => ({ ...f, caretaker_person_id: e.target.value }))} required>
          <option value="">Select caretaker</option>
          {caretakerPeople.map((p) => (
            <option key={p.id} value={p.id}>{p.name || p.email}</option>
          ))}
        </select>
        <select value={form.estate_id} onChange={(e) => setForm((f) => ({ ...f, estate_id: e.target.value }))}>
          <option value="">No estate</option>
          {estates.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <select value={form.block_id} onChange={(e) => setForm((f) => ({ ...f, block_id: e.target.value }))}>
          <option value="">No block</option>
          {blocks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <input value={form.template_id} onChange={(e) => setForm((f) => ({ ...f, template_id: e.target.value }))} placeholder="Template ID, optional" />
        <input value={form.template_name} onChange={(e) => setForm((f) => ({ ...f, template_name: e.target.value }))} placeholder="Task / form type" required />
        <select value={form.day_of_week} onChange={(e) => setForm((f) => ({ ...f, day_of_week: e.target.value }))}>
          {DAYS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <select value={form.frequency} onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value }))}>
          <option value="weekly">Weekly</option>
        </select>
        <button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Add caretaker schedule'}</button>
      </form>

      <button type="button" onClick={generateDueWork}>Generate today's due work</button>

      <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: '1rem' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', border: '1px solid #ccc' }}>Caretaker</th>
            <th style={{ textAlign: 'left', border: '1px solid #ccc' }}>Estate / Block</th>
            <th style={{ textAlign: 'left', border: '1px solid #ccc' }}>Task / form</th>
            <th style={{ textAlign: 'left', border: '1px solid #ccc' }}>Day</th>
            <th style={{ textAlign: 'left', border: '1px solid #ccc' }}>Active</th>
          </tr>
        </thead>
        <tbody>
          {schedules.map((s) => (
            <tr key={s.id}>
              <td style={{ border: '1px solid #ccc' }}>{s.caretaker_name || s.caretaker_email || s.caretaker_user_email || '-'}</td>
              <td style={{ border: '1px solid #ccc' }}>{[s.estate_name, s.block_name].filter(Boolean).join(' / ') || '-'}</td>
              <td style={{ border: '1px solid #ccc' }}>{s.template_name || s.template_id || '-'}</td>
              <td style={{ border: '1px solid #ccc' }}>{DAYS.find(([value]) => Number(value) === Number(s.day_of_week))?.[1] || s.day_of_week}</td>
              <td style={{ border: '1px solid #ccc' }}>
                <button type="button" onClick={() => toggleActive(s)}>{s.active ? 'Active' : 'Inactive'}</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
