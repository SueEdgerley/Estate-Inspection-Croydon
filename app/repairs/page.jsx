'use client'

import { useEffect, useState } from 'react'
import { formatIssueReference } from '@/lib/issue-number'

const STATUS_OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'closed', label: 'Closed' },
]

function photoList(value) {
  if (Array.isArray(value)) return value.filter((url) => typeof url === 'string' && url.startsWith('http'))
  if (typeof value === 'string' && value.trim()) {
    try {
      return photoList(JSON.parse(value))
    } catch {
      return value.startsWith('http') ? [value] : []
    }
  }
  return []
}

function thumbnailFor(action) {
  return photoList(action.photo_urls)[0] || (String(action.repair_photo_url || '').startsWith('http') ? action.repair_photo_url : '')
}

function formatWhen(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function referenceFor(action) {
  return action.issue_reference || formatIssueReference(Number(action.issue_number)) || action.id
}

export default function RepairsQueuePage() {
  const [teamName, setTeamName] = useState('Repairs')
  const [actions, setActions] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [query, setQuery] = useState('')
  const [submittedQuery, setSubmittedQuery] = useState('')
  const [raised, setRaised] = useState('')
  const [listStatus, setListStatus] = useState('outstanding')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState(null)
  const [drafts, setDrafts] = useState({})
  const [savingId, setSavingId] = useState(null)

  async function loadQueue(next = {}) {
    const current = {
      page,
      query: submittedQuery,
      raised,
      listStatus,
      ...next,
    }
    const params = new URLSearchParams()
    if (current.query) params.set('q', current.query)
    if (current.raised) params.set('raised', current.raised)
    if (current.listStatus) params.set('status', current.listStatus)
    params.set('page', String(current.page || 1))
    const response = await fetch(`/api/repairs/queue?${params.toString()}`, { credentials: 'include', cache: 'no-store' })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || 'The Repairs queue could not be loaded')
    setTeamName(data.team?.name || 'Repairs')
    setActions(Array.isArray(data.actions) ? data.actions : [])
    setTotal(Number(data.total || 0))
    setPage(Number(data.page || 1))
    setPageSize(Number(data.pageSize || 25))
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await loadQueue({ page: 1, query: '', raised: '', listStatus: 'outstanding' })
      } catch (loadError) {
        if (!cancelled) setError(loadError.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // The first view is the outstanding backlog. Later searches call loadQueue directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function draftFor(action) {
    return drafts[action.id] || {
      status: action.status || 'open',
      repair_notes: '',
      repair_photo_url: '',
    }
  }

  function updateDraft(actionId, patch) {
    setDrafts((current) => ({
      ...current,
      [actionId]: { ...(current[actionId] || {}), ...patch },
    }))
  }

  async function uploadPhoto(action, file) {
    if (!file) return
    const body = new FormData()
    body.append('file', file)
    const response = await fetch('/api/upload/photo', { method: 'POST', body })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || 'The photo could not be uploaded')
    const draft = draftFor(action)
    updateDraft(action.id, { ...draft, repair_photo_url: data.url })
  }

  async function save(action) {
    const draft = draftFor(action)
    const payload = { status: draft.status || action.status || 'open' }
    if (String(draft.repair_notes || '').trim()) payload.repair_notes = String(draft.repair_notes).trim()
    if (draft.repair_photo_url) payload.repair_photo_url = draft.repair_photo_url
    setSavingId(action.id)
    setError('')
    try {
      const response = await fetch(`/api/actions/${action.id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'The update could not be saved')
      setDrafts((current) => ({ ...current, [action.id]: { status: data.status || payload.status, repair_notes: '', repair_photo_url: '' } }))
      await loadQueue()
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setSavingId(null)
    }
  }

  async function applySearch(event) {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      setSubmittedQuery(query)
      await loadQueue({ page: 1, query, raised, listStatus })
    } catch (searchError) {
      setError(searchError.message)
    } finally {
      setLoading(false)
    }
  }

  async function changePage(nextPage) {
    setLoading(true)
    setError('')
    try {
      await loadQueue({ page: nextPage })
    } catch (pageError) {
      setError(pageError.message)
    } finally {
      setLoading(false)
    }
  }

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)

  return (
    <main style={{ maxWidth: 880, margin: '0 auto', padding: '1.25rem' }}>
      <h1 style={{ margin: '0 0 0.35rem', fontSize: '1.5rem' }}>{teamName} queue</h1>
      <p style={{ margin: '0 0 1rem', color: '#4b5563' }}>
        Outstanding repairs are shown first. Completed records stay available through the status filter.
        Existing records keep their original reference, details and photographs. Saving a note updates that same record.
      </p>
      <form onSubmit={applySearch} style={{ display: 'grid', gap: '0.65rem', marginBottom: '1rem' }}>
        <label>
          Search by reference, record ID, block, address or description
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            style={{ display: 'block', width: '100%', marginTop: 4, padding: '0.45rem' }}
          />
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
          <label>
            Date raised
            <input
              type="date"
              value={raised}
              onChange={(event) => setRaised(event.target.value)}
              style={{ display: 'block', marginTop: 4, padding: '0.45rem' }}
            />
          </label>
          <label>
            Show
            <select
              value={listStatus}
              onChange={(event) => setListStatus(event.target.value)}
              style={{ display: 'block', marginTop: 4, padding: '0.45rem' }}
            >
              <option value="outstanding">Outstanding</option>
              <option value="completed">Completed</option>
              <option value="all">All</option>
            </select>
          </label>
          <button type="submit" style={{ alignSelf: 'end' }}>Search</button>
        </div>
      </form>
      <p style={{ marginTop: 0 }}>{loading ? 'Loading…' : `Showing ${from}–${to} of ${total}`}</p>
      {error && (
        <p style={{ padding: '0.75rem 1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#991b1b' }}>
          {error}
        </p>
      )}
      {!loading && actions.length === 0 && <p>No records match this search.</p>}
      <div style={{ display: 'grid', gap: '0.75rem' }}>
        {actions.map((action) => {
          const open = openId === action.id
          const draft = draftFor(action)
          const photos = photoList(action.photo_urls)
          if (action.repair_photo_url && !photos.includes(action.repair_photo_url)) photos.push(action.repair_photo_url)
          const thumbnail = thumbnailFor(action)
          return (
            <section key={action.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '0.9rem 1rem' }}>
              <button
                type="button"
                onClick={() => setOpenId(open ? null : action.id)}
                style={{ background: 'none', border: 0, padding: 0, textAlign: 'left', cursor: 'pointer', width: '100%' }}
              >
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  {thumbnail ? (
                    <img src={thumbnail} alt="" style={{ width: 72, height: 54, objectFit: 'cover', borderRadius: 6, flex: '0 0 auto' }} />
                  ) : (
                    <div style={{ width: 72, height: 54, borderRadius: 6, background: '#f3f4f6', color: '#6b7280', fontSize: 12, display: 'grid', placeItems: 'center' }}>No photo</div>
                  )}
                  <div>
                    <strong>{referenceFor(action)}</strong>
                    <div>{action.estate_block_name || action.location || 'Location not recorded'}</div>
                    <div style={{ color: '#374151' }}>{action.description || action.title || action.comment || 'No description'}</div>
                    <div style={{ color: '#4b5563', marginTop: 4 }}>
                      {formatWhen(action.created_at)} · {(action.status || 'open').replace(/_/g, ' ')}
                      {action.location ? ` · ${action.location}` : ''}
                    </div>
                  </div>
                </div>
              </button>
              {(action.flags || []).map((flag) => (
                <p key={flag.type} style={{ margin: '0.65rem 0 0', padding: '0.45rem 0.6rem', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, color: '#92400e' }}>
                  {flag.type === 'possible_duplicate' ? 'Possible duplicate' : 'Uncertain ownership'}: {flag.reason}
                </p>
              ))}
              {open && (
                <div style={{ marginTop: '0.85rem' }}>
                  {photos.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
                      {photos.map((url) => (
                        <a key={url} href={url} target="_blank" rel="noreferrer">
                          <img src={url} alt="" style={{ width: 120, height: 90, objectFit: 'cover', borderRadius: 6 }} />
                        </a>
                      ))}
                    </div>
                  )}
                  <h2 style={{ fontSize: '1rem', margin: '0.5rem 0' }}>Progress</h2>
                  {(action.progress || []).length === 0 && <p style={{ color: '#6b7280' }}>No progress notes yet.</p>}
                  <ul style={{ paddingLeft: '1.1rem' }}>
                    {(action.progress || []).map((entry) => (
                      <li key={entry.id} style={{ marginBottom: '0.45rem' }}>
                        <div>{formatWhen(entry.created_at)} · {entry.status_before || 'open'} to {entry.status_after || entry.status_before || 'open'}</div>
                        {entry.note && <div>{entry.note}</div>}
                        {entry.photo_url && <a href={entry.photo_url}>Completion photo</a>}
                      </li>
                    ))}
                  </ul>
                  {action.repair_notes && <p><strong>Latest note:</strong> {action.repair_notes}</p>}
                  <label style={{ display: 'block', marginTop: '0.75rem' }}>
                    Status
                    <select
                      value={draft.status || 'open'}
                      onChange={(event) => updateDraft(action.id, { ...draft, status: event.target.value })}
                      style={{ display: 'block', marginTop: 4, padding: '0.4rem' }}
                    >
                      {STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  <label style={{ display: 'block', marginTop: '0.75rem' }}>
                    Progress note
                    <textarea
                      value={draft.repair_notes || ''}
                      onChange={(event) => updateDraft(action.id, { ...draft, repair_notes: event.target.value })}
                      rows={3}
                      style={{ display: 'block', width: '100%', marginTop: 4 }}
                    />
                  </label>
                  <label style={{ display: 'block', marginTop: '0.75rem' }}>
                    Completion photo
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(event) => {
                        const file = event.target.files?.[0]
                        uploadPhoto(action, file).catch((uploadError) => setError(uploadError.message))
                      }}
                      style={{ display: 'block', marginTop: 4 }}
                    />
                  </label>
                  <button type="button" onClick={() => save(action)} disabled={savingId === action.id} style={{ marginTop: '0.85rem' }}>
                    {savingId === action.id ? 'Saving…' : 'Save progress'}
                  </button>
                </div>
              )}
            </section>
          )
        })}
      </div>
      {total > pageSize && (
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
          <button type="button" disabled={page <= 1 || loading} onClick={() => changePage(page - 1)}>Previous</button>
          <button type="button" disabled={page * pageSize >= total || loading} onClick={() => changePage(page + 1)}>Next</button>
        </div>
      )}
    </main>
  )
}
