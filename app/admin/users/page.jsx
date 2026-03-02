'use client'

import { useState, useEffect } from 'react'

const ROLES = ['caretaker', 'esm', 'housing officer', 'admin']

export default function AdminUsersPage() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [form, setForm] = useState({ name: '', email: '', role: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/admin/users', { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setUsers(data)
        else if (data.error) setError(data.error)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const handleAdd = async (e) => {
    e.preventDefault()
    if (!form.name?.trim() || !form.email?.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: form.name.trim(), email: form.email.trim(), role: form.role || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setUsers((prev) => [...prev.filter((u) => u.email !== data.email), data])
      setForm({ name: '', email: '', role: '' })
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDeactivate = async (id, active) => {
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ active: !active }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      const updated = await res.json()
      setUsers((prev) => prev.map((u) => (u.id === id ? updated : u)))
    } catch (e) {
      setError(e.message)
    }
  }

  const handleRoleChange = async (id, role) => {
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ role: role || null }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      const updated = await res.json()
      setUsers((prev) => prev.map((u) => (u.id === id ? updated : u)))
    } catch (e) {
      setError(e.message)
    }
  }

  if (loading) return <p>Loading…</p>

  return (
    <div>
      <h1>User management</h1>
      {error && <p style={{ color: 'red' }}>{error}</p>}

      <form onSubmit={handleAdd} style={{ marginBottom: '2rem' }}>
        <h2>Add user</h2>
        <input
          placeholder="Name"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
        <input
          type="email"
          placeholder="Email"
          value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
        />
        <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
          <option value="">No role</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <button type="submit" disabled={saving}>Add</button>
      </form>

      <h2>Users</h2>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', border: '1px solid #ccc' }}>Name</th>
            <th style={{ textAlign: 'left', border: '1px solid #ccc' }}>Email</th>
            <th style={{ textAlign: 'left', border: '1px solid #ccc' }}>Role</th>
            <th style={{ textAlign: 'left', border: '1px solid #ccc' }}>Active</th>
            <th style={{ textAlign: 'left', border: '1px solid #ccc' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td style={{ border: '1px solid #ccc' }}>{u.name}</td>
              <td style={{ border: '1px solid #ccc' }}>{u.email}</td>
              <td style={{ border: '1px solid #ccc' }}>
                <select
                  value={u.role || ''}
                  onChange={(e) => handleRoleChange(u.id, e.target.value || null)}
                >
                  <option value="">—</option>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </td>
              <td style={{ border: '1px solid #ccc' }}>{u.active ? 'Yes' : 'No'}</td>
              <td style={{ border: '1px solid #ccc' }}>
                <button type="button" onClick={() => handleDeactivate(u.id, u.active)}>
                  {u.active ? 'Deactivate' : 'Activate'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
