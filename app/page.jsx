'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getAllIssues, ISSUE_TYPE_LABELS, ISSUE_STATUS_LABELS } from '@/lib/issues'

export default function Home() {
  const [issues, setIssues] = useState([])

  useEffect(() => {
    // Load issues on mount
    const loadIssues = async () => {
      const data = await getAllIssues()
      setIssues(data)
    }
    
    loadIssues()
    
    // Refresh issues periodically
    const interval = setInterval(async () => {
      const data = await getAllIssues()
      setIssues(data)
    }, 5000) // Check every 5 seconds

    return () => {
      clearInterval(interval)
    }
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

  const getStatusColor = (status) => {
    switch (status) {
      case 'open':
        return '#ef4444' // red
      case 'in_progress':
        return '#f59e0b' // amber
      case 'resolved':
        return '#10b981' // green
      default:
        return '#6b7280' // gray
    }
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '2rem'
      }}>
        <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 'bold' }}>
          Estate Inspection Issues
        </h1>
        <Link 
          href="/issues/new"
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: '#3b82f6',
            color: 'white',
            textDecoration: 'none',
            borderRadius: '0.5rem',
            fontWeight: '500',
            display: 'inline-block',
          }}
        >
          New Issue
        </Link>
      </div>

      {issues.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '4rem 2rem',
          backgroundColor: 'white',
          borderRadius: '0.5rem',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        }}>
          <p style={{ fontSize: '1.25rem', color: '#6b7280', marginBottom: '1rem' }}>
            No issues logged yet
          </p>
          <Link 
            href="/issues/new"
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#3b82f6',
              color: 'white',
              textDecoration: 'none',
              borderRadius: '0.5rem',
              fontWeight: '500',
              display: 'inline-block',
            }}
          >
            Log Your First Issue
          </Link>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: '1.5rem',
        }}>
          {issues.map((issue) => (
            <div
              key={issue.id}
              style={{
                backgroundColor: 'white',
                padding: '1.5rem',
                borderRadius: '0.5rem',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
                border: '1px solid #e5e7eb',
              }}
            >
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'flex-start',
                marginBottom: '1rem'
              }}>
                <span style={{
                  fontSize: '0.875rem',
                  color: '#6b7280',
                  fontWeight: '500',
                }}>
                  {ISSUE_TYPE_LABELS[issue.type] || issue.type}
                </span>
                <span style={{
                  padding: '0.25rem 0.75rem',
                  borderRadius: '9999px',
                  fontSize: '0.75rem',
                  fontWeight: '600',
                  backgroundColor: getStatusColor(issue.status) + '20',
                  color: getStatusColor(issue.status),
                }}>
                  {ISSUE_STATUS_LABELS[issue.status] || issue.status}
                </span>
              </div>

              <h3 style={{
                margin: '0 0 0.5rem 0',
                fontSize: '1.125rem',
                fontWeight: '600',
                color: '#111827',
              }}>
                {issue.title}
              </h3>

              {issue.description && (
                <p style={{
                  margin: '0 0 0.75rem 0',
                  fontSize: '0.875rem',
                  color: '#6b7280',
                  lineHeight: '1.5',
                }}>
                  {issue.description}
                </p>
              )}

              {issue.location && (
                <p style={{
                  margin: '0 0 0.75rem 0',
                  fontSize: '0.875rem',
                  color: '#6b7280',
                }}>
                  <strong>Location:</strong> {issue.location}
                </p>
              )}

              <p style={{
                margin: '0.75rem 0 0 0',
                fontSize: '0.75rem',
                color: '#9ca3af',
                borderTop: '1px solid #e5e7eb',
                paddingTop: '0.75rem',
              }}>
                Created: {formatDate(issue.createdAt)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
