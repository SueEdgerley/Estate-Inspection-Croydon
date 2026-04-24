'use client'

import { useState, useEffect } from 'react'

export default function ActionsPage() {
  const [actions, setActions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadActions = async () => {
      try {
        const res = await fetch('/api/actions', { cache: 'no-store', credentials: 'include' })
        const data = await res.json().catch(() => [])
        setActions(Array.isArray(data) ? data : [])
      } catch (error) {
        console.error('Error loading actions:', error)
      } finally {
        setLoading(false)
      }
    }

    loadActions()

    const interval = setInterval(async () => {
      const res = await fetch('/api/actions', { cache: 'no-store', credentials: 'include' })
      const data = await res.json().catch(() => [])
      setActions(Array.isArray(data) ? data : [])
    }, 30000)

    return () => clearInterval(interval)
  }, [])

  const formatDate = (dateString) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 'bold', color: '#111827' }}>
          Issues / Actions
        </h1>
        <p style={{ margin: '0.5rem 0 0 0', color: '#6b7280' }}>
          Issues and actions raised from inspection forms
        </p>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
          Loading issues…
        </div>
      ) : actions.length === 0 ? (
        <div style={{
          backgroundColor: 'white',
          padding: '3rem',
          borderRadius: '0.5rem',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          textAlign: 'center'
        }}>
          <p style={{ fontSize: '1.125rem', color: '#6b7280' }}>
            No issues found
          </p>
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '0.5rem', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f9fafb' }}>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.875rem' }}>Category</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.875rem' }}>Created by</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.875rem' }}>Assigned to</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.875rem' }}>Location</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.875rem' }}>Raised on</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.875rem' }}>Due Date</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.875rem' }}>Priority</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.875rem' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {actions.map((a) => (
                <tr key={a.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem' }}>{a.category || 'other'}</td>
                  <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem' }}>{a.created_by || '-'}</td>
                  <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem' }}>{a.assigned_to || '-'}</td>
                  <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem' }}>{a.location || '-'}</td>
                  <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem' }}>{formatDate(a.created_at)}</td>
                  <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem' }}>{a.expected_completion_date ? formatDate(a.expected_completion_date) : '-'}</td>
                  <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem' }}>{a.priority || '-'}</td>
                  <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem' }}>{a.status || 'open'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
