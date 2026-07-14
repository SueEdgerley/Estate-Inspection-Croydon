'use client'

import { useState, useEffect } from 'react'

export default function AdminBlocksPage() {
  const [blocks, setBlocks] = useState([])
  const [estates, setEstates] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [name, setName] = useState('')
  const [estateId, setEstateId] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/blocks', { credentials: 'include' }).then((r) => r.json()),
      fetch('/api/admin/estates', { credentials: 'include' }).then((r) => r.json()),
    ])
      .then(([b, e]) => {
        if (Array.isArray(b)) setBlocks(b)
        if (Array.isArray(e)) setEstates(e)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const handleAdd = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/blocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: name.trim(), estate_id: estateId || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setBlocks((prev) =>
        [...prev, data].sort((a, b) =>
          String(a.name || '').localeCompare(String(b.name || ''), 'en-GB', {
            sensitivity: 'base',
            numeric: true,
          })
        )
      )
      setName('')
      setEstateId('')
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p>Loading…</p>

  return (
    <div>
      <h1>Blocks</h1>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <form onSubmit={handleAdd} style={{ marginBottom: '1.5rem' }}>
        <input placeholder="Block name" value={name} onChange={(e) => setName(e.target.value)} />
        <select value={estateId} onChange={(e) => setEstateId(e.target.value)}>
          <option value="">No estate</option>
          {estates.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
        <button type="submit" disabled={saving}>Add</button>
      </form>
      <ul>
        {blocks.map((b) => (
          <li key={b.id} style={{ opacity: b.active === false ? 0.5 : 1 }}>
            {b.name}
            {b.active === false && <span style={{ color: '#9ca3af' }}> (inactive)</span>}
            {b.estate_name && ` — ${b.estate_name}`}
          </li>
        ))}
      </ul>
    </div>
  )
}
