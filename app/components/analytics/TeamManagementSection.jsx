'use client'

import { useState } from 'react'
import { photobook } from '@/lib/photobook-theme'

async function readJson(res) {
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`)
  return data
}

function StaffSelect({ people, value, onChange, emptyLabel }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{ padding: '0.4rem', minWidth: '12rem' }}>
      <option value="">{emptyLabel}</option>
      {people.map((person) => (
        <option key={person.personId || person.value} value={person.personId}>
          {person.label}
        </option>
      ))}
    </select>
  )
}

function TeamEditor({ team, people, onChanged }) {
  const [name, setName] = useState(team.name || '')
  const [managerPersonId, setManagerPersonId] = useState(team.managerPersonId || '')
  const [memberToAdd, setMemberToAdd] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function saveDetails(event) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await readJson(
        await fetch(`/api/analytics/teams/${encodeURIComponent(team.id)}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, managerPersonId: managerPersonId || null }),
        })
      )
      await onChanged()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function saveMembers(memberPersonIds) {
    setBusy(true)
    setError(null)
    try {
      await readJson(
        await fetch(`/api/analytics/teams/${encodeURIComponent(team.id)}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ memberPersonIds }),
        })
      )
      setMemberToAdd('')
      await onChanged()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function removeTeam() {
    if (!window.confirm(`Delete ${team.name}?`)) return
    setBusy(true)
    setError(null)
    try {
      await readJson(
        await fetch(`/api/analytics/teams/${encodeURIComponent(team.id)}`, {
          method: 'DELETE',
          credentials: 'include',
        })
      )
      await onChanged()
    } catch (e) {
      setError(e.message)
      setBusy(false)
    }
  }

  const memberIds = (team.members || []).map((member) => member.personId)
  const available = people.filter((person) => !memberIds.includes(person.personId))

  return (
    <div style={{ borderTop: `1px solid ${photobook.softBorder}`, paddingTop: '0.85rem' }}>
      <form onSubmit={saveDetails} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'end' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.78rem' }}>
          <span style={{ fontWeight: 600 }}>Team name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required style={{ padding: '0.4rem' }} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.78rem' }}>
          <span style={{ fontWeight: 600 }}>Manager</span>
          <StaffSelect people={people} value={managerPersonId} onChange={setManagerPersonId} emptyLabel="No manager yet" />
        </label>
        <button type="submit" disabled={busy} style={{ padding: '0.45rem 0.7rem', fontWeight: 600 }}>
          Save team
        </button>
        <button type="button" onClick={removeTeam} disabled={busy} style={{ padding: '0.45rem 0.7rem' }}>
          Delete
        </button>
      </form>
      <p style={{ margin: '0.65rem 0 0.35rem', fontSize: '0.82rem', color: '#374151' }}>
        <strong>{team.memberCount || 0}</strong> {team.memberCount === 1 ? 'member' : 'members'}
      </p>
      {team.empty ? (
        <p style={{ margin: '0 0 0.5rem', fontSize: '0.82rem', color: '#92400E' }}>
          No members yet. This team will show no inspections until staff are added.
        </p>
      ) : (
        <ul style={{ margin: '0 0 0.5rem', paddingLeft: '1.1rem', fontSize: '0.85rem' }}>
          {(team.members || []).map((member) => (
            <li key={member.personId} style={{ marginBottom: '0.25rem' }}>
              {member.label}{' '}
              <button
                type="button"
                disabled={busy}
                onClick={() => saveMembers(memberIds.filter((id) => id !== member.personId))}
                style={{ border: 'none', background: 'none', color: photobook.link, cursor: 'pointer', fontWeight: 600 }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
        <StaffSelect people={available} value={memberToAdd} onChange={setMemberToAdd} emptyLabel="Add a staff member" />
        <button
          type="button"
          disabled={busy || !memberToAdd}
          onClick={() => saveMembers([...memberIds, memberToAdd])}
          style={{ padding: '0.45rem 0.7rem', fontWeight: 600 }}
        >
          Add member
        </button>
      </div>
      {error ? <p style={{ margin: '0.45rem 0 0', color: '#991b1b', fontSize: '0.82rem' }}>{error}</p> : null}
    </div>
  )
}

export default function TeamManagementSection({ teams, people, onChanged }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [managerPersonId, setManagerPersonId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function createTeam(event) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await readJson(
        await fetch('/api/analytics/teams', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, managerPersonId: managerPersonId || null }),
        })
      )
      setName('')
      setManagerPersonId('')
      await onChanged()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section style={{ marginTop: '0.85rem', borderTop: `1px solid ${photobook.softBorder}`, paddingTop: '0.75rem' }}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          color: photobook.heading,
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        {open ? 'Hide team management' : 'Manage teams'}
      </button>
      {open ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem', marginTop: '0.75rem' }}>
          <p style={{ margin: 0, fontSize: '0.82rem', color: '#6b7280', lineHeight: 1.45 }}>
            Create a team now and add staff later. An empty team stays in the filter and shows no inspections.
            Analytics uses the current member list, including for earlier months.
          </p>
          <form onSubmit={createTeam} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'end' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.78rem' }}>
              <span style={{ fontWeight: 600 }}>New team</span>
              <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Team name" style={{ padding: '0.4rem' }} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.78rem' }}>
              <span style={{ fontWeight: 600 }}>Manager</span>
              <StaffSelect people={people} value={managerPersonId} onChange={setManagerPersonId} emptyLabel="No manager yet" />
            </label>
            <button type="submit" disabled={busy} style={{ padding: '0.45rem 0.75rem', fontWeight: 600 }}>
              Create team
            </button>
          </form>
          {error ? <p style={{ margin: 0, color: '#991b1b', fontSize: '0.82rem' }}>{error}</p> : null}
          {(teams || []).length === 0 ? (
            <p style={{ margin: 0, color: '#6b7280', fontSize: '0.85rem' }}>No teams yet.</p>
          ) : (
            (teams || []).map((team) => (
              <TeamEditor key={team.id} team={team} people={people} onChanged={onChanged} />
            ))
          )}
        </div>
      ) : null}
    </section>
  )
}
