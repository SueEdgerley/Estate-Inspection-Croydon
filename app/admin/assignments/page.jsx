'use client'

import { useState, useEffect } from 'react'

const ROLES = ['caretaker', 'esm', 'housing officer', 'admin']

export default function AdminAssignmentsPage() {
  const [assignments, setAssignments] = useState([])
  const [users, setUsers] = useState([])
  const [estates, setEstates] = useState([])
  const [blocks, setBlocks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [form, setForm] = useState({ person_id: '', estate_id: '', block_id: '', role: '', starts_at: '', ends_at: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/assignments', { credentials: 'include' }).then((r) => r.json()),
      fetch('/api/admin/users', { credentials: 'include' }).then((r) => r.json()),
      fetch('/api/admin/estates', { credentials: 'include' }).then((r) => r.json()),
      fetch('/api/admin/blocks', { credentials: 'include' }).then((r) => r.json()),
    ]).then(([a, u, e, b]) => {
      if (Array.isArray(a)) setAssignments(a)
      if (Array.isArray(u)) setUsers(u)
      if (Array.isArray(e)) setEstates(e)
      if (Array.isArray(b)) setBlocks(b)
    }).catch((e) => setError(e.message)).finally(() => setLoading(false))
  }, [])

  const handleAdd = async (e) => {
    e.preventDefault()
    if (!form.person_id || !form.role) return
    if (!form.estate_id && !form.block_id) { setError('Set estate or block'); return }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          person_id: form.person_id,
          estate_id: form.estate_id || undefined,
          block_id: form.block_id || undefined,
          role: form.role,
          starts_at: form.starts_at || new Date().toISOString().slice(0, 16),
          ends_at: form.ends_at || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setAssignments((prev) => [data, ...prev])
      setForm({ person_id: '', estate_id: '', block_id: '', role: '', starts_at: '', ends_at: '' })
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleEnd = async (id) => {
    try {
      const res = await fetch('/api/admin/assignments/' + id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ends_at: new Date().toISOString() }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      const updated = await res.json()
      setAssignments((prev) => prev.map((a) => (a.id === id ? updated : a)))
    } catch (err) {
      setError(err.message)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Remove this assignment?')) return
    try {
      const res = await fetch('/api/admin/assignments/' + id, { method: 'DELETE', credentials: 'include' })
      if (!res.ok) throw new Error((await res.json()).error)
      setAssignments((prev) => prev.filter((a) => a.id !== id))
    } catch (err) {
      setError(err.message)
    }
  }

  if (loading) return <p>Loading…</p>

  return (
    <div>
      <h1>Assignments</h1>
      <p>Time-bounded assignments. Inspections are tied to estate, block, and submitter.</p>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <form onSubmit={handleAdd} style={{ marginBottom: '2rem' }}>
        <h2>Add assignment</h2>
        <select value={form.person_id} onChange={(e) => setForm((f) => ({ ...f, person_id: e.target.value }))} required>
          <option value="">Select user</option>
          {users
            .filter((u) => u.person_id && u.account_active !== false)
            .map((u) => (
              <option key={u.person_id} value={u.person_id}>
                {u.name} ({u.email})
              </option>
            ))}
        </select>
        <select value={form.estate_id} onChange={(e) => setForm((f) => ({ ...f, estate_id: e.target.value }))}>
          <option value="">No estate</option>
          {estates.map((est) => (
            <option key={est.id} value={est.id}>{est.name}</option>
          ))}
        </select>
        <select value={form.block_id} onChange={(e) => setForm((f) => ({ ...f, block_id: e.target.value }))}>
          <option value="">No block</option>
          {blocks.map((bl) => (
            <option key={bl.id} value={bl.id}>{bl.name}</option>
          ))}
        </select>
        <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} required>
          <option value="">Role</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <input type="datetime-local" value={form.starts_at} onChange={(e) => setForm((f) => ({ ...f, starts_at: e.target.value }))} />
        <input type="datetime-local" placeholder="Ends (optional)" value={form.ends_at} onChange={(e) => setForm((f) => ({ ...f, ends_at: e.target.value }))} />
        <button type="submit" disabled={saving}>Add</button>
      </form>
      <h2>Assignments</h2>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', border: '1px solid #ccc' }}>Person</th>
            <th style={{ textAlign: 'left', border: '1px solid #ccc' }}>Estate / Block</th>
            <th style={{ textAlign: 'left', border: '1px solid #ccc' }}>Role</th>
            <th style={{ textAlign: 'left', border: '1px solid #ccc' }}>Starts</th>
            <th style={{ textAlign: 'left', border: '1px solid #ccc' }}>Ends</th>
            <th style={{ textAlign: 'left', border: '1px solid #ccc' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {assignments.map((a) => (
            <tr key={a.id}>
              <td style={{ border: '1px solid #ccc' }}>{a.person_name} ({a.person_email})</td>
              <td style={{ border: '1px solid #ccc' }}>{[a.estate_name, a.block_name].filter(Boolean).join(' / ') || '—'}</td>
              <td style={{ border: '1px solid #ccc' }}>{a.role}</td>
              <td style={{ border: '1px solid #ccc' }}>{a.starts_at ? new Date(a.starts_at).toLocaleString() : '—'}</td>
              <td style={{ border: '1px solid #ccc' }}>{a.ends_at ? new Date(a.ends_at).toLocaleString() : 'Ongoing'}</td>
              <td style={{ border: '1px solid #ccc' }}>
                {!a.ends_at && <button type="button" onClick={() => handleEnd(a.id)}>End now</button>}
                <button type="button" onClick={() => handleDelete(a.id)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
