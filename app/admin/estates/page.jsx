'use client'

import { useState, useEffect } from 'react'

export default function AdminEstatesPage() {
  const [estates, setEstates] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/admin/estates', { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => Array.isArray(data) && setEstates(data))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const handleAdd = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/estates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: name.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setEstates((prev) => [...prev, data])
      setName('')
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p>Loading…</p>

  return (
    <div>
      <h1>Estates</h1>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <form onSubmit={handleAdd} style={{ marginBottom: '1.5rem' }}>
        <input placeholder="Estate name" value={name} onChange={(e) => setName(e.target.value)} />
        <button type="submit" disabled={saving}>Add</button>
      </form>
      <ul>
        {estates.map((e) => (
          <li key={e.id}>{e.name}</li>
        ))}
      </ul>
    </div>
  )
}
