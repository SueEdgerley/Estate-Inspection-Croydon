'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getAllIssues, ISSUE_TYPE_LABELS, ISSUE_STATUS_LABELS } from '@/lib/issues'

export default function DashboardHome() {
  const [issues, setIssues] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadIssues = async () => {
      try {
        const data = await getAllIssues()
        setIssues(data)
      } catch (error) {
        console.error('Error loading issues:', error)
      } finally {
        setLoading(false)
      }
    }
    
    loadIssues()
    
    const interval = setInterval(async () => {
      const data = await getAllIssues()
      setIssues(data)
    }, 30000) // Refresh every 30 seconds

    return () => clearInterval(interval)
  }, [])

  const openIssues = issues.filter(i => i.status === 'open').length
  const inProgressIssues = issues.filter(i => i.status === 'in_progress').length
  const resolvedIssues = issues.filter(i => i.status === 'resolved').length

  return (
    <div>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 'bold', color: '#111827' }}>
          Dashboard
        </h1>
        <p style={{ margin: '0.5rem 0 0 0', color: '#6b7280' }}>
          Overview of estate inspections and actions
        </p>
      </div>

      {/* Stats Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '1.5rem',
        marginBottom: '2rem'
      }}>
        <div style={{
          backgroundColor: 'white',
          padding: '1.5rem',
          borderRadius: '0.5rem',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          borderLeft: '4px solid #ef4444'
        }}>
          <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>
            Open Issues
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#111827' }}>
            {loading ? '...' : openIssues}
          </div>
        </div>

        <div style={{
          backgroundColor: 'white',
          padding: '1.5rem',
          borderRadius: '0.5rem',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          borderLeft: '4px solid #f59e0b'
        }}>
          <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>
            In Progress
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#111827' }}>
            {loading ? '...' : inProgressIssues}
          </div>
        </div>

        <div style={{
          backgroundColor: 'white',
          padding: '1.5rem',
          borderRadius: '0.5rem',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          borderLeft: '4px solid #10b981'
        }}>
          <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>
            Resolved
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#111827' }}>
            {loading ? '...' : resolvedIssues}
          </div>
        </div>

        <div style={{
          backgroundColor: 'white',
          padding: '1.5rem',
          borderRadius: '0.5rem',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          borderLeft: '4px solid #3b82f6'
        }}>
          <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>
            Total Issues
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#111827' }}>
            {loading ? '...' : issues.length}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div style={{
        backgroundColor: 'white',
        padding: '1.5rem',
        borderRadius: '0.5rem',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        marginBottom: '2rem'
      }}>
        <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.25rem', fontWeight: '600' }}>
          Quick Actions
        </h2>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <Link
            href="/inspections"
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#3b82f6',
              color: 'white',
              textDecoration: 'none',
              borderRadius: '0.5rem',
              fontWeight: '500',
              display: 'inline-block'
            }}
          >
            Start New Inspection
          </Link>
          <Link
            href="/actions"
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: 'white',
              color: '#374151',
              textDecoration: 'none',
              borderRadius: '0.5rem',
              fontWeight: '500',
              display: 'inline-block',
              border: '1px solid #d1d5db'
            }}
          >
            View All Actions
          </Link>
        </div>
      </div>

      {/* Recent Issues */}
      <div style={{
        backgroundColor: 'white',
        padding: '1.5rem',
        borderRadius: '0.5rem',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '600' }}>
            Recent Issues
          </h2>
          <Link
            href="/actions"
            style={{
              fontSize: '0.875rem',
              color: '#3b82f6',
              textDecoration: 'none'
            }}
          >
            View all →
          </Link>
        </div>

        {loading ? (
          <p style={{ color: '#6b7280' }}>Loading...</p>
        ) : issues.length === 0 ? (
          <p style={{ color: '#6b7280' }}>No issues yet. Start a new inspection to log issues.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {issues.slice(0, 5).map((issue) => (
              <div
                key={issue.id}
                style={{
                  padding: '1rem',
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.375rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div>
                  <div style={{ fontWeight: '600', marginBottom: '0.25rem' }}>
                    {issue.title}
                  </div>
                  <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                    {ISSUE_TYPE_LABELS[issue.type]} • {ISSUE_STATUS_LABELS[issue.status]}
                  </div>
                </div>
                <span style={{
                  padding: '0.25rem 0.75rem',
                  borderRadius: '9999px',
                  fontSize: '0.75rem',
                  fontWeight: '600',
                  backgroundColor: issue.status === 'open' ? '#fee2e2' : issue.status === 'in_progress' ? '#fef3c7' : '#d1fae5',
                  color: issue.status === 'open' ? '#dc2626' : issue.status === 'in_progress' ? '#d97706' : '#059669'
                }}>
                  {ISSUE_STATUS_LABELS[issue.status]}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
