'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

const STAFF_ROLES = ['caretaker', 'esm', 'housing officer', 'admin']
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

  const [staff, setStaff] = useState([])
  const [appAccounts, setAppAccounts] = useState([])
  const [recipients, setRecipients] = useState([])

  const [staffForm, setStaffForm] = useState({ name: '', email: '', role: '' })
  const [recipientForm, setRecipientForm] = useState({ name: '', email: '' })
  const [editingStaffId, setEditingStaffId] = useState(null)
  const [editStaff, setEditStaff] = useState({ name: '', email: '', role: '' })
  const [editingRecipientId, setEditingRecipientId] = useState(null)
  const [editRecipient, setEditRecipient] = useState({ name: '', email: '' })
  const [saving, setSaving] = useState(false)
  /** Manage Users: filter rows by Clerk account active flag */
  const [staffAccountFilter, setStaffAccountFilter] = useState('all')

  const filteredStaff = useMemo(() => {
    if (staffAccountFilter === 'active') return staff.filter((u) => u.account_active !== false)
    if (staffAccountFilter === 'inactive') return staff.filter((u) => u.account_active === false)
    return staff
  }, [staff, staffAccountFilter])

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

  const refreshAppAccounts = useCallback(async () => {
    const res = await fetch('/api/admin/app-users', { credentials: 'include' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'Failed to load app accounts')
    setAppAccounts(Array.isArray(data) ? data : [])
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
        await Promise.all([refreshAppAccounts(), refreshStaff(), refreshRecipients()])
      } catch (e) {
        if (!cancelled) setLoadError(e.message)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [refreshAppAccounts, refreshStaff, refreshRecipients])

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
      await refreshAppAccounts()
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
      await refreshAppAccounts()
    } catch (err) {
      setLoadError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const patchAppAccount = async (id, body) => {
    setLoadError(null)
    try {
      const res = await fetch(`/api/admin/app-users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Update failed')
      await refreshAppAccounts()
      await refreshStaff()
    } catch (err) {
      setLoadError(err.message)
    }
  }

  const syncStaffFromAppAccount = async (id) => {
    setSaving(true)
    setLoadError(null)
    try {
      const res = await fetch(`/api/admin/app-users/${id}/sync-staff`, {
        method: 'POST',
        credentials: 'include',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Sync failed')
      await refreshAppAccounts()
      await refreshStaff()
    } catch (err) {
      setLoadError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const toggleManageUserAccount = async (id, accountActive) => {
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
      await refreshStaff()
      await refreshAppAccounts()
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
        App sign-ins (<code style={{ fontSize: '0.85em' }}>users</code>), staff directory (<code style={{ fontSize: '0.85em' }}>people</code>), and issue email routing — all in Postgres (not Airtable).
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

      <section id="app-accounts" style={card}>
        <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1.125rem', fontWeight: 600 }}>App accounts (Clerk)</h2>
        <p style={{ margin: '0 0 1rem 0', fontSize: '0.875rem', color: '#6b7280' }}>
          Everyone who signs in via Clerk. <strong>App access role</strong> (owner / admin / user) controls dashboard and Settings; new accounts default to <code style={{ fontSize: '0.85em' }}>user</code>.
        </p>
        <p style={{ margin: '0 0 1rem 0', fontSize: '0.8125rem', color: '#4b5563', lineHeight: 1.45 }}>
          New sign-ins are created automatically. Use <strong>Link staff directory</strong> to add the same email under Manage Users (for assignments and staff roles).
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Email</th>
                <th style={th}>Clerk ID</th>
                <th style={th}>App role</th>
                <th style={th}>Active</th>
                <th style={th}>Staff list</th>
                <th style={th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {appAccounts.map((u) => (
                <tr key={u.id}>
                  <td style={td}>{u.email || '—'}</td>
                  <td style={{ ...td, fontFamily: 'ui-monospace, monospace', fontSize: '0.8125rem', color: '#6b7280' }}>
                    {u.clerk_user_id ? `${u.clerk_user_id.slice(0, 14)}…` : '—'}
                  </td>
                  <td style={td}>
                    <select
                      value={(u.role || 'user').toLowerCase()}
                      onChange={(e) => patchAppAccount(u.id, { role: e.target.value })}
                      style={{ padding: '0.35rem 0.5rem', borderRadius: 6, border: '1px solid #d1d5db' }}
                    >
                      {APP_ACCESS_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={td}>{u.is_active === false ? 'No' : 'Yes'}</td>
                  <td style={td}>{u.staff_directory_name || '—'}</td>
                  <td style={td}>
                    <button
                      type="button"
                      disabled={saving || !u.email}
                      onClick={() => syncStaffFromAppAccount(u.id)}
                      style={{
                        padding: '0.35rem 0.65rem',
                        fontSize: '0.8125rem',
                        borderRadius: 6,
                        border: '1px solid #d1d5db',
                        background: '#fff',
                        cursor: saving || !u.email ? 'not-allowed' : 'pointer',
                      }}
                    >
                      Link staff directory
                    </button>
                    <button
                      type="button"
                      onClick={() => patchAppAccount(u.id, { is_active: u.is_active === false })}
                      style={{
                        marginLeft: 8,
                        fontSize: '0.8125rem',
                        color: '#b45309',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      {u.is_active === false ? 'Activate' : 'Deactivate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {appAccounts.length === 0 && (
            <p style={{ fontSize: '0.875rem', color: '#9ca3af', marginTop: '0.5rem' }}>No Clerk accounts in the database yet.</p>
          )}
        </div>
      </section>

      <section id="manage-users" style={card}>
        <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1.125rem', fontWeight: 600 }}>Manage Users (staff directory)</h2>
        <p style={{ margin: '0 0 1rem 0', fontSize: '0.875rem', color: '#6b7280' }}>
          Staff for assignments and forms. Roles: {STAFF_ROLES.join(', ')}. Linked automatically when someone signs in (same email) unless you add them here first.
        </p>
        <p style={{ margin: '0 0 1rem 0', fontSize: '0.8125rem', color: '#4b5563', lineHeight: 1.45 }}>
          Use <strong>Link staff directory</strong> under App accounts if a sign-in exists but they do not appear here yet.
        </p>
        <p style={{ margin: '0 0 1rem 0', fontSize: '0.8125rem', color: '#4b5563', lineHeight: 1.45 }}>
          <strong>Access:</strong> use <strong>Deactivate account</strong> to block sign-in and directory use. Accounts stay in the database for audit — there is no permanent delete from this screen.
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          <span style={{ fontSize: '0.8125rem', color: '#6b7280', fontWeight: 600 }}>Show:</span>
          <select
            value={staffAccountFilter}
            onChange={(e) => setStaffAccountFilter(e.target.value)}
            style={{ padding: '0.35rem 0.65rem', borderRadius: 6, border: '1px solid #d1d5db', fontSize: '0.875rem' }}
          >
            <option value="all">All ({staff.length})</option>
            <option value="active">Active only ({staff.filter((u) => u.account_active !== false).length})</option>
            <option value="inactive">Inactive only ({staff.filter((u) => u.account_active === false).length})</option>
          </select>
        </div>

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
                <th style={th}>Account active</th>
                <th style={th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredStaff.map((u) => (
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
                      <td style={td}>{u.account_active === false ? 'No' : 'Yes'}</td>
                      <td style={{ ...td, whiteSpace: 'normal' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center' }}>
                          <button type="button" onClick={() => saveStaffEdit(u.id)} disabled={saving} style={{ marginRight: 4 }}>
                            Save
                          </button>
                          <button type="button" onClick={() => setEditingStaffId(null)}>
                            Cancel
                          </button>
                          {u.account_active === false ? (
                            <button
                              type="button"
                              onClick={() => toggleManageUserAccount(u.id, false)}
                              style={btnReactivateAccount}
                            >
                              Reactivate account
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => toggleManageUserAccount(u.id, true)}
                              style={btnDeactivateAccount}
                            >
                              Deactivate account
                            </button>
                          )}
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td style={td}>{u.name}</td>
                      <td style={td}>{u.email}</td>
                      <td style={td}>{u.role || '—'}</td>
                      <td style={td}>{u.account_active === false ? 'No' : 'Yes'}</td>
                      <td style={{ ...td, whiteSpace: 'normal' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center' }}>
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
                              onClick={() => toggleManageUserAccount(u.id, false)}
                              style={btnReactivateAccount}
                            >
                              Reactivate account
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => toggleManageUserAccount(u.id, true)}
                              style={btnDeactivateAccount}
                            >
                              Deactivate account
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
          {filteredStaff.length === 0 && staff.length > 0 && (
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
