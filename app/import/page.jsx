'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function DataImportAdminPage() {
  const router = useRouter()
  const [file, setFile] = useState(null)
  const [status, setStatus] = useState('completed')
  const [result, setResult] = useState('')
  const [allowed, setAllowed] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/access', { credentials: 'include' })
      .then((r) => {
        if (cancelled) return
        setAllowed(r.ok)
        if (!r.ok) router.replace('/dashboard')
      })
      .catch(() => {
        if (cancelled) return
        setAllowed(false)
        router.replace('/dashboard')
      })
    return () => {
      cancelled = true
    }
  }, [router])

  async function upload() {
    if (!file) return
    setResult('Uploading...')

    try {
      const fd = new FormData()
      fd.append('file', file)

      const res = await fetch(`/api/import/photobook?status=${status}`, {
        method: 'POST',
        credentials: 'include',
        body: fd,
      })

      const data = await res.text()
      setResult(data)
    } catch (err) {
      setResult(`Error: ${err?.message ?? String(err)}`)
    }
  }

  if (allowed === null) {
    return (
      <div style={{ padding: 24 }}>
        <p>Checking access…</p>
      </div>
    )
  }

  if (!allowed) {
    return (
      <div style={{ padding: 24, maxWidth: 480 }}>
        <p style={{ color: '#6b7280', marginTop: '0.75rem' }}>Redirecting...</p>
      </div>
    )
  }

  return (
    <div style={{ padding: 24, maxWidth: 720 }}>
      <h1>Data Import (Admin)</h1>
      <p style={{ color: '#6b7280', fontSize: '0.9375rem', marginTop: '0.5rem' }}>
        Photobook CSV import only. This page is not part of Settings.
      </p>

      <div style={{ marginTop: 12 }}>
        <label>
          Type:&nbsp;
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="completed">Completed</option>
          </select>
        </label>
      </div>

      <div style={{ marginTop: 12 }}>
        <input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] || null)} />
      </div>

      <div style={{ marginTop: 12 }}>
        <button type="button" onClick={upload} disabled={!file}>
          Upload CSV
        </button>
      </div>

      <pre style={{ marginTop: 12, background: '#f5f5f5', padding: 12, borderRadius: 8 }}>{result}</pre>
    </div>
  )
}
