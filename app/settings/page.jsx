'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

const APP_ACCESS_ROLES = ['owner', 'admin', 'user']

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

const btnDeactivateAccount = {
  padding: '0.4rem 0.85rem',
  fontSize: '0.8125rem',
  borderRadius: 6,
  border: '1px solid #dc2626',
  backgroundColor: '#fef2f2',
  color: '#b91c1c',
  fontWeight: 600,
  cursor: 'pointer',
}
const btnReactivateAccount = {
  padding: '0.4rem 0.85rem',
  fontSize: '0.8125rem',
  borderRadius: 6,
  border: '1px solid #16a34a',
  backgroundColor: '#f0fdf4',
  color: '#15803d',
  fontWeight: 600,
  cursor: 'pointer',
}

export default function SettingsPage() {
  const [allowed, setAllowed] = useState(null)
  const [loadError, setLoadError] = useState(null)

  const [users, setUsers] = useState([])
  const [recipients, setRecipients] = useState([])

  const [recipientForm, setRecipientForm] = useState({ name: '', email: '' })
  const [editingUserId, setEditingUserId] = useState(null)
  const [editUser, setEditUser] = useState({ email: '', role: '' })
  const [editingRecipientId, setEditingRecipientId] = useState(null)
  const [editRecipient, setEditRecipient] = useState({ name: '', email: '' })
  const [saving, setSaving] = useState(false)
  const [accountFilter, setAccountFilter] = useState('all')

  const filteredUsers = useMemo(() => {
    if (accountFilter === 'active') return users.filter((u) => u.account_active !== false)
    if (accountFilter === 'inactive') return users.filter((u) => u.account_active === false)
    return users
  }, [users, accountFilter])

  const refreshUsers = useCallback(async () => {
    const res = await fetch('/api/admin/users', { credentials: 'include' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'Failed to load users')
    setUsers(Array.isArray(data) ? data : [])
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
        await Promise.all([refreshUsers(), refreshRecipients()])
      } catch (e) {
        if (!cancelled) setLoadError(e.message)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [refreshUsers, refreshRecipients])

  const saveUserEdit = async (id) => {
    setSaving(true)
    setLoadError(null)
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: editUser.email.trim(),
          role: editUser.role || 'user',
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Update failed')
      setEditingUserId(null)
      await refreshUsers()
    } catch (err) {
      setLoadError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const toggleUserAccount = async (id, accountActive) => {
    setLoadError(null)
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ account_active: !accountActive }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Update failed')
      await refreshUsers()
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

  const displayUserLabel = (u) => {
    const em = (u.email && String(u.email).trim()) || ''
    return em || '—'
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
        <strong>Manage Users</strong> controls app accounts in Postgres <code style={{ fontSize: '0.85em' }}>users</code> (Clerk sign-ins).{' '}
        <strong>Issue Recipients</strong> are routing contacts in <code style={{ fontSize: '0.85em' }}>people</code> only — separate from login accounts.
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
          App access (dashboard, Settings): roles are {APP_ACCESS_ROLES.join(', ')}. New sign-ins appear here automatically when someone uses Clerk.
        </p>
        <p style={{ margin: '0 0 1rem 0', fontSize: '0.8125rem', color: '#4b5563', lineHeight: 1.45 }}>
          <strong>Access:</strong> use <strong>Deactivate</strong> to block sign-in. Rows stay for audit (no delete from this screen).
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          <span style={{ fontSize: '0.8125rem', color: '#6b7280', fontWeight: 600 }}>Show:</span>
          <select
            value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value)}
            style={{ padding: '0.35rem 0.65rem', borderRadius: 6, border: '1px solid #d1d5db', fontSize: '0.875rem' }}
          >
            <option value="all">All ({users.length})</option>
            <option value="active">Active only ({users.filter((u) => u.account_active !== false).length})</option>
            <option value="inactive">Inactive only ({users.filter((u) => u.account_active === false).length})</option>
          </select>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Email</th>
                <th style={th}>Role</th>
                <th style={th}>Active</th>
                <th style={th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((u) => (
                <tr key={u.id}>
                  {editingUserId === u.id ? (
                    <>
                      <td style={td}>
                        <input
                          type="email"
                          value={editUser.email}
                          onChange={(e) => setEditUser((s) => ({ ...s, email: e.target.value }))}
                          style={{ width: '100%', padding: '0.35rem 0.5rem', borderRadius: 4, border: '1px solid #d1d5db' }}
                        />
                      </td>
                      <td style={td}>
                        <select
                          value={(editUser.role || 'user').toLowerCase()}
                          onChange={(e) => setEditUser((s) => ({ ...s, role: e.target.value }))}
                          style={{ padding: '0.35rem 0.5rem', borderRadius: 4, border: '1px solid #d1d5db' }}
                        >
                          {APP_ACCESS_ROLES.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td style={td}>{u.account_active === false ? 'No' : 'Yes'}</td>
                      <td style={{ ...td, whiteSpace: 'normal' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center' }}>
                          <button type="button" onClick={() => saveUserEdit(u.id)} disabled={saving} style={{ marginRight: 4 }}>
                            Save
                          </button>
                          <button type="button" onClick={() => setEditingUserId(null)}>
                            Cancel
                          </button>
                          {u.account_active === false ? (
                            <button
                              type="button"
                              onClick={() => toggleUserAccount(u.id, false)}
                              style={btnReactivateAccount}
                            >
                              Reactivate
                            </button>
                          ) : (
                            <button type="button" onClick={() => toggleUserAccount(u.id, true)} style={btnDeactivateAccount}>
                              Deactivate
                            </button>
                          )}
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td style={td}>{displayUserLabel(u)}</td>
                      <td style={td}>{(u.role || 'user').toLowerCase()}</td>
                      <td style={td}>{u.account_active === false ? 'No' : 'Yes'}</td>
                      <td style={{ ...td, whiteSpace: 'normal' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center' }}>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingUserId(u.id)
                              setEditUser({
                                email: u.email || '',
                                role: (u.role || 'user').toLowerCase(),
                              })
                            }}
                            style={{
                              padding: '0.35rem 0.65rem',
                              fontSize: '0.8125rem',
                              borderRadius: 6,
                              border: '1px solid #d1d5db',
                              background: '#fff',
                              cursor: 'pointer',
                            }}
                          >
                            Edit
                          </button>
                          {u.account_active === false ? (
                            <button
                              type="button"
                              onClick={() => toggleUserAccount(u.id, false)}
                              style={btnReactivateAccount}
                            >
                              Reactivate
                            </button>
                          ) : (
                            <button type="button" onClick={() => toggleUserAccount(u.id, true)} style={btnDeactivateAccount}>
                              Deactivate
                            </button>
                          )}
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {users.length === 0 && (
            <p style={{ fontSize: '0.875rem', color: '#9ca3af', marginTop: '0.5rem' }}>No app users yet. Sign in once to create an account row.</p>
          )}
          {filteredUsers.length === 0 && users.length > 0 && (
            <p style={{ fontSize: '0.875rem', color: '#9ca3af', marginTop: '0.5rem' }}>No rows match this filter.</p>
          )}
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
