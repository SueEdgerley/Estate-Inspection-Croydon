'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

const STAFF_ROLES = ['caretaker', 'esm', 'housing officer', 'admin']

const card = {
  backgroundColor: '#fff',
  borderRadius: 8,
  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  border: '1px solid #e5e7eb',
  padding: '1.25rem 1.5rem',
  marginBottom: '1.5rem',
}

const th = { textAlign: 'left', borderBottom: '1px solid #e5e7eb', padding: '0.5rem 0.75rem', fontSize: '0.8125rem', color: '#6b7280' }
const td = { borderBottom: '1px solid #f3f4f6', padding: '0.65rem 0.75rem', fontSize: '0.9375rem' }

export default function SettingsPage() {
  const [allowed, setAllowed] = useState(null)
  const [loadError, setLoadError] = useState(null)

  const [staff, setStaff] = useState([])
  const [recipients, setRecipients] = useState([])

  const [staffForm, setStaffForm] = useState({ name: '', email: '', role: '' })
  const [recipientForm, setRecipientForm] = useState({ name: '', email: '' })
  const [editingStaffId, setEditingStaffId] = useState(null)
  const [editStaff, setEditStaff] = useState({ name: '', email: '', role: '' })
  const [editingRecipientId, setEditingRecipientId] = useState(null)
  const [editRecipient, setEditRecipient] = useState({ name: '', email: '' })
  const [saving, setSaving] = useState(false)

  const refreshStaff = useCallback(async () => {
    const res = await fetch('/api/admin/users', { credentials: 'include' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'Failed to load users')
    setStaff(Array.isArray(data) ? data : [])
  }, [])

  const refreshRecipients = useCallback(async () => {
    const res = await fetch('/api/admin/issue-recipients', { credentials: 'include' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'Failed to load recipients')
    setRecipients(Array.isArray(data) ? data : [])
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const access = await fetch('/api/admin/access', { credentials: 'include' })
      if (!access.ok) {
        if (!cancelled) setAllowed(false)
        return
      }
      if (!cancelled) setAllowed(true)
      try {
        await Promise.all([refreshStaff(), refreshRecipients()])
      } catch (e) {
        if (!cancelled) setLoadError(e.message)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [refreshStaff, refreshRecipients])

  const addStaff = async (e) => {
    e.preventDefault()
    if (!staffForm.name.trim() || !staffForm.email.trim()) return
    setSaving(true)
    setLoadError(null)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: staffForm.name.trim(),
          email: staffForm.email.trim(),
          role: staffForm.role || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      setStaffForm({ name: '', email: '', role: '' })
      await refreshStaff()
    } catch (err) {
      setLoadError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const saveStaffEdit = async (id) => {
    setSaving(true)
    setLoadError(null)
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: editStaff.name.trim(),
          email: editStaff.email.trim(),
          role: editStaff.role || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Update failed')
      setEditingStaffId(null)
      await refreshStaff()
    } catch (err) {
      setLoadError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const toggleStaffActive = async (id, active) => {
    setLoadError(null)
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ active: !active }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Update failed')
      await refreshStaff()
    } catch (err) {
      setLoadError(err.message)
    }
  }

  const addRecipient = async (e) => {
    e.preventDefault()
    if (!recipientForm.name.trim() || !recipientForm.email.trim()) return
    setSaving(true)
    setLoadError(null)
    try {
      const res = await fetch('/api/admin/issue-recipients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: recipientForm.name.trim(),
          email: recipientForm.email.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      setRecipientForm({ name: '', email: '' })
      await refreshRecipients()
    } catch (err) {
      setLoadError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const saveRecipientEdit = async (id) => {
    setSaving(true)
    setLoadError(null)
    try {
      const res = await fetch(`/api/admin/issue-recipients/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: editRecipient.name.trim(),
          email: editRecipient.email.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Update failed')
      setEditingRecipientId(null)
      await refreshRecipients()
    } catch (err) {
      setLoadError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const deleteRecipient = async (id) => {
    if (!confirm('Remove this issue recipient?')) return
    setLoadError(null)
    try {
      const res = await fetch(`/api/admin/issue-recipients/${id}`, { method: 'DELETE', credentials: 'include' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Delete failed')
      await refreshRecipients()
    } catch (err) {
      setLoadError(err.message)
    }
  }

  if (allowed === null) {
    return (
      <div style={{ padding: '2rem' }}>
        <p style={{ color: '#6b7280' }}>Checking access…</p>
      </div>
    )
  }

  if (!allowed) {
    return (
      <div style={{ padding: '2rem', maxWidth: 480 }}>
        <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Settings</h1>
        <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
          You do not have permission to view Settings. Admin or owner access is required.
        </p>
        <Link href="/dashboard" style={{ color: '#1d4ed8' }}>
          Back to dashboard
        </Link>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 960 }}>
      <h1 style={{ margin: '0 0 0.25rem 0', fontSize: '1.75rem', fontWeight: 700, color: '#111827' }}>Settings</h1>
      <p style={{ margin: '0 0 1.5rem 0', color: '#6b7280', fontSize: '0.9375rem' }}>
        Manage team users and issue email routing. Data lives in Postgres only (not Airtable).
      </p>

      {loadError && (
        <div
          style={{
            marginBottom: '1rem',
            padding: '0.75rem 1rem',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 8,
            color: '#b91c1c',
            fontSize: '0.875rem',
          }}
        >
          {loadError}
        </div>
      )}

      <section id="manage-users" style={card}>
        <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1.125rem', fontWeight: 600 }}>Manage Users</h2>
        <p style={{ margin: '0 0 1rem 0', fontSize: '0.875rem', color: '#6b7280' }}>
          People who use the app or appear in assignments. Roles: {STAFF_ROLES.join(', ')}.
        </p>
        <p style={{ margin: '0 0 1rem 0', fontSize: '0.8125rem', color: '#4b5563', lineHeight: 1.45 }}>
          Users must log in once before they appear here. After that, assign their role and activate them.
        </p>

        <form onSubmit={addStaff} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.25rem', alignItems: 'flex-end' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: '#6b7280', marginBottom: 4 }}>Name</label>
            <input
              value={staffForm.name}
              onChange={(e) => setStaffForm((f) => ({ ...f, name: e.target.value }))}
              style={{ padding: '0.5rem 0.65rem', borderRadius: 6, border: '1px solid #d1d5db', minWidth: 160 }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: '#6b7280', marginBottom: 4 }}>Email</label>
            <input
              type="email"
              value={staffForm.email}
              onChange={(e) => setStaffForm((f) => ({ ...f, email: e.target.value }))}
              style={{ padding: '0.5rem 0.65rem', borderRadius: 6, border: '1px solid #d1d5db', minWidth: 200 }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: '#6b7280', marginBottom: 4 }}>Role</label>
            <select
              value={staffForm.role}
              onChange={(e) => setStaffForm((f) => ({ ...f, role: e.target.value }))}
              style={{ padding: '0.5rem 0.65rem', borderRadius: 6, border: '1px solid #d1d5db' }}
            >
              <option value="">—</option>
              {STAFF_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={saving}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#1e3a8a',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              fontWeight: 600,
              cursor: saving ? 'wait' : 'pointer',
            }}
          >
            Add user
          </button>
        </form>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Name</th>
                <th style={th}>Email</th>
                <th style={th}>Role</th>
                <th style={th}>Active</th>
                <th style={th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((u) => (
                <tr key={u.id}>
                  {editingStaffId === u.id ? (
                    <>
                      <td style={td}>
                        <input
                          value={editStaff.name}
                          onChange={(e) => setEditStaff((s) => ({ ...s, name: e.target.value }))}
                          style={{ width: '100%', padding: '0.35rem 0.5rem', borderRadius: 4, border: '1px solid #d1d5db' }}
                        />
                      </td>
                      <td style={td}>
                        <input
                          type="email"
                          value={editStaff.email}
                          onChange={(e) => setEditStaff((s) => ({ ...s, email: e.target.value }))}
                          style={{ width: '100%', padding: '0.35rem 0.5rem', borderRadius: 4, border: '1px solid #d1d5db' }}
                        />
                      </td>
                      <td style={td}>
                        <select
                          value={editStaff.role}
                          onChange={(e) => setEditStaff((s) => ({ ...s, role: e.target.value }))}
                          style={{ padding: '0.35rem 0.5rem', borderRadius: 4, border: '1px solid #d1d5db' }}
                        >
                          <option value="">—</option>
                          {STAFF_ROLES.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td style={td}>{u.active ? 'Yes' : 'No'}</td>
                      <td style={td}>
                        <button type="button" onClick={() => saveStaffEdit(u.id)} disabled={saving} style={{ marginRight: 8 }}>
                          Save
                        </button>
                        <button type="button" onClick={() => setEditingStaffId(null)}>
                          Cancel
                        </button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td style={td}>{u.name}</td>
                      <td style={td}>{u.email}</td>
                      <td style={td}>{u.role || '—'}</td>
                      <td style={td}>{u.active ? 'Yes' : 'No'}</td>
                      <td style={td}>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingStaffId(u.id)
                            setEditStaff({
                              name: u.name || '',
                              email: u.email || '',
                              role: u.role || '',
                            })
                          }}
                          style={{ marginRight: 8, color: '#1d4ed8', background: 'none', border: 'none', cursor: 'pointer' }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleStaffActive(u.id, u.active)}
                          style={{ color: '#b45309', background: 'none', border: 'none', cursor: 'pointer' }}
                        >
                          {u.active ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section id="issue-recipients" style={card}>
        <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1.125rem', fontWeight: 600 }}>Issue Recipients</h2>
        <p style={{ margin: '0 0 1rem 0', fontSize: '0.875rem', color: '#6b7280' }}>
          Named mailboxes for inspection issue routing and form recipient dropdowns. Stored in Postgres{' '}
          <code style={{ fontSize: '0.8em' }}>people</code> with <code style={{ fontSize: '0.8em' }}>category = issue_recipient</code>.
        </p>

        <form onSubmit={addRecipient} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.25rem', alignItems: 'flex-end' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: '#6b7280', marginBottom: 4 }}>Name (e.g. Repairs)</label>
            <input
              value={recipientForm.name}
              onChange={(e) => setRecipientForm((f) => ({ ...f, name: e.target.value }))}
              style={{ padding: '0.5rem 0.65rem', borderRadius: 6, border: '1px solid #d1d5db', minWidth: 180 }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: '#6b7280', marginBottom: 4 }}>Email</label>
            <input
              type="email"
              value={recipientForm.email}
              onChange={(e) => setRecipientForm((f) => ({ ...f, email: e.target.value }))}
              style={{ padding: '0.5rem 0.65rem', borderRadius: 6, border: '1px solid #d1d5db', minWidth: 220 }}
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#1e3a8a',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              fontWeight: 600,
              cursor: saving ? 'wait' : 'pointer',
            }}
          >
            Add recipient
          </button>
        </form>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Name</th>
                <th style={th}>Email</th>
                <th style={th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {recipients.map((r) => (
                <tr key={r.id}>
                  {editingRecipientId === r.id ? (
                    <>
                      <td style={td}>
                        <input
                          value={editRecipient.name}
                          onChange={(e) => setEditRecipient((s) => ({ ...s, name: e.target.value }))}
                          style={{ width: '100%', padding: '0.35rem 0.5rem', borderRadius: 4, border: '1px solid #d1d5db' }}
                        />
                      </td>
                      <td style={td}>
                        <input
                          type="email"
                          value={editRecipient.email}
                          onChange={(e) => setEditRecipient((s) => ({ ...s, email: e.target.value }))}
                          style={{ width: '100%', padding: '0.35rem 0.5rem', borderRadius: 4, border: '1px solid #d1d5db' }}
                        />
                      </td>
                      <td style={td}>
                        <button type="button" onClick={() => saveRecipientEdit(r.id)} disabled={saving} style={{ marginRight: 8 }}>
                          Save
                        </button>
                        <button type="button" onClick={() => setEditingRecipientId(null)}>
                          Cancel
                        </button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td style={td}>{r.name}</td>
                      <td style={td}>{r.email}</td>
                      <td style={td}>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingRecipientId(r.id)
                            setEditRecipient({ name: r.name || '', email: r.email || '' })
                          }}
                          style={{ marginRight: 8, color: '#1d4ed8', background: 'none', border: 'none', cursor: 'pointer' }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteRecipient(r.id)}
                          style={{ color: '#b91c1c', background: 'none', border: 'none', cursor: 'pointer' }}
                        >
                          Delete
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {recipients.length === 0 && (
            <p style={{ fontSize: '0.875rem', color: '#9ca3af', marginTop: '0.5rem' }}>No issue recipients yet.</p>
          )}
        </div>
      </section>
    </div>
  )
}
