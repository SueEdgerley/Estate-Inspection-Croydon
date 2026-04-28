'use client'

import { useEffect, useState } from 'react'

export default function AdminBestPracticeGuidesPage() {
  const [guides, setGuides] = useState([])
  const [templates, setTemplates] = useState([])
  const [form, setForm] = useState({
    title: '',
    template_id: '',
    template_key: '',
    template_name: '',
    file: null,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [guidesRes, templatesRes] = await Promise.all([
        fetch('/api/admin/best-practice-guides', { credentials: 'include', cache: 'no-store' }),
        fetch('/api/templates', { credentials: 'include', cache: 'no-store' }),
      ])
      const guidesData = await guidesRes.json().catch(() => ({}))
      if (!guidesRes.ok) throw new Error(guidesData.error || 'Failed to load guides')
      setGuides(Array.isArray(guidesData) ? guidesData : [])

      const templatesData = await templatesRes.json().catch(() => ({}))
      const list = Array.isArray(templatesData?.templates) ? templatesData.templates : []
      setTemplates(list)
    } catch (e) {
      setError(e?.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  function selectTemplate(templateId) {
    const t = templates.find((item) => item.id === templateId)
    setForm((prev) => ({
      ...prev,
      template_id: t?.id || '',
      template_key: t?.template_key || '',
      template_name: t?.name || t?.template_name || '',
      title: prev.title || `${t?.name || t?.template_name || 'Form'} Best Practice Guide`,
    }))
  }

  async function submit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const fd = new FormData()
      fd.set('title', form.title)
      fd.set('template_id', form.template_id)
      fd.set('template_key', form.template_key)
      fd.set('template_name', form.template_name)
      if (form.file) fd.set('file', form.file)

      const res = await fetch('/api/admin/best-practice-guides', {
        method: 'POST',
        credentials: 'include',
        body: fd,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Upload failed')
      setGuides((prev) => [data, ...prev])
      setForm({ title: '', template_id: '', template_key: '', template_name: '', file: null })
      setMessage('Guide uploaded.')
      const fileInput = document.getElementById('guide-file')
      if (fileInput) fileInput.value = ''
    } catch (e) {
      setError(e?.message || 'Upload failed')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(guide) {
    setError('')
    const res = await fetch(`/api/admin/best-practice-guides/${guide.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ active: !guide.active }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(data.error || 'Failed to update guide')
      return
    }
    setGuides((prev) => prev.map((g) => (g.id === guide.id ? data : g)))
  }

  if (loading) return <p>Loading...</p>

  return (
    <div style={{ maxWidth: 1100 }}>
      <h1>Best Practice Guides</h1>
      <p style={{ color: '#64748b' }}>
        Phase 1 supports PDF guides linked to forms/templates. Phase 2 can add image quick guides by question or category.
      </p>

      {error && <p style={{ color: '#b91c1c' }}>{error}</p>}
      {message && <p style={{ color: '#166534' }}>{message}</p>}

      <form onSubmit={submit} style={{ display: 'grid', gap: '0.75rem', margin: '1.5rem 0', padding: '1rem', border: '1px solid #e2e8f0', borderRadius: 8 }}>
        <select value={form.template_id} onChange={(e) => selectTemplate(e.target.value)}>
          <option value="">Select template, or type details below</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name || t.template_name || t.id}
            </option>
          ))}
        </select>
        <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Guide title" required />
        <input value={form.template_id} onChange={(e) => setForm((f) => ({ ...f, template_id: e.target.value }))} placeholder="Template ID" />
        <input value={form.template_key} onChange={(e) => setForm((f) => ({ ...f, template_key: e.target.value }))} placeholder="Template key" />
        <input value={form.template_name} onChange={(e) => setForm((f) => ({ ...f, template_name: e.target.value }))} placeholder="Template name" />
        <input id="guide-file" type="file" accept="application/pdf,.pdf" onChange={(e) => setForm((f) => ({ ...f, file: e.target.files?.[0] || null }))} required />
        <button type="submit" disabled={saving}>{saving ? 'Uploading...' : 'Upload PDF guide'}</button>
      </form>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={th}>Title</th>
            <th style={th}>Template</th>
            <th style={th}>Status</th>
            <th style={th}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {guides.map((guide) => (
            <tr key={guide.id}>
              <td style={td}>{guide.title}</td>
              <td style={td}>{guide.template_name || guide.template_key || guide.template_id || '-'}</td>
              <td style={td}>{guide.active ? 'Active' : 'Inactive'}</td>
              <td style={td}>
                <a href={guide.file_url} target="_blank" rel="noopener noreferrer">Open</a>
                <button type="button" onClick={() => toggleActive(guide)} style={{ marginLeft: 8 }}>
                  {guide.active ? 'Deactivate' : 'Activate'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const th = { textAlign: 'left', borderBottom: '1px solid #e5e7eb', padding: '0.5rem' }
const td = { borderBottom: '1px solid #f1f5f9', padding: '0.65rem 0.5rem' }
