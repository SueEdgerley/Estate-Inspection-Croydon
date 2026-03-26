'use client'

import { useState, useEffect } from 'react'

export default function AdminCostCodesPage() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [form, setForm] = useState({ code: '', description: '', category: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/admin/cost-codes', { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setRows(data)
        else if (data.error) setError(data.error)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const add = async (e) => {
    e.preventDefault()
    if (!form.code.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/cost-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setRows((prev) => [...prev.filter((x) => x.id !== data.id), data].sort((a, b) => String(a.code).localeCompare(String(b.code))))
      setForm({ code: '', description: '', category: '' })
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const patch = async (id, patchBody) => {
    try {
      const res = await fetch(`/api/admin/cost-codes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(patchBody),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setRows((prev) => prev.map((x) => (x.id === id ? data : x)))
    } catch (e) {
      setError(e.message)
    }
  }

  if (loading) return <p>Loading…</p>

  return (
    <div>
      <h1>Cost codes</h1>
      {error && <p style={{ color: 'red' }}>{error}</p>}

      <form onSubmit={add} style={{ marginBottom: '2rem' }}>
        <h2>Add cost code</h2>
        <input placeholder="Code" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} />
        <input placeholder="Description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        <input placeholder="Category (optional)" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} />
        <button type="submit" disabled={saving}>Add</button>
      </form>

      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', border: '1px solid #ccc' }}>Code</th>
            <th style={{ textAlign: 'left', border: '1px solid #ccc' }}>Description</th>
            <th style={{ textAlign: 'left', border: '1px solid #ccc' }}>Category</th>
            <th style={{ textAlign: 'left', border: '1px solid #ccc' }}>Active</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td style={{ border: '1px solid #ccc', padding: '0.25rem' }}>
                <input value={r.code || ''} onChange={(e) => setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, code: e.target.value } : x)))} onBlur={() => patch(r.id, { code: r.code })} />
              </td>
              <td style={{ border: '1px solid #ccc', padding: '0.25rem' }}>
                <input value={r.description || ''} onChange={(e) => setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, description: e.target.value } : x)))} onBlur={() => patch(r.id, { description: r.description })} />
              </td>
              <td style={{ border: '1px solid #ccc', padding: '0.25rem' }}>
                <input value={r.category || ''} onChange={(e) => setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, category: e.target.value } : x)))} onBlur={() => patch(r.id, { category: r.category })} />
              </td>
              <td style={{ border: '1px solid #ccc', padding: '0.25rem' }}>
                <input type="checkbox" checked={!!r.active} onChange={(e) => patch(r.id, { active: e.target.checked })} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
