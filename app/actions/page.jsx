'use client'

import { useState, useEffect } from 'react'
import { getAllIssues, ISSUE_TYPE_LABELS, ISSUE_STATUS_LABELS, ISSUE_TYPES } from '@/lib/issues'

export default function ActionsPage() {
  const [issues, setIssues] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedType, setSelectedType] = useState('all')

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

  const getStatusColor = (status) => {
    switch (status) {
      case 'open':
        return { bg: '#fee2e2', text: '#dc2626' }
      case 'in_progress':
        return { bg: '#fef3c7', text: '#d97706' }
      case 'resolved':
        return { bg: '#d1fae5', text: '#059669' }
      default:
        return { bg: '#f3f4f6', text: '#6b7280' }
    }
  }

  const filteredIssues = selectedType === 'all'
    ? issues
    : issues.filter(issue => issue.type === selectedType)

  const repairsIssues = issues.filter(i => i.type === ISSUE_TYPES.REPAIRS)
  const groundsIssues = issues.filter(i => i.type === ISSUE_TYPES.GROUNDS_MAINTENANCE)
  const cleaningIssues = issues.filter(i => i.type === ISSUE_TYPES.CLEANING)

  return (
    <div>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 'bold', color: '#111827' }}>
          Actions
        </h1>
        <p style={{ margin: '0.5rem 0 0 0', color: '#6b7280' }}>
          View and manage repairs, grounds maintenance, and cleaning actions
        </p>
      </div>

      <div style={{
        display: 'flex',
        gap: '0.5rem',
        marginBottom: '2rem',
        borderBottom: '2px solid #e5e7eb'
      }}>
        <button
          onClick={() => setSelectedType('all')}
          style={{
            padding: '0.75rem 1.5rem',
            border: 'none',
            backgroundColor: 'transparent',
            color: selectedType === 'all' ? '#3b82f6' : '#6b7280',
            fontWeight: selectedType === 'all' ? '600' : '500',
            borderBottom: selectedType === 'all' ? '2px solid #3b82f6' : '2px solid transparent',
            marginBottom: '-2px',
            cursor: 'pointer'
          }}
        >
          All Actions ({issues.length})
        </button>
        <button
          onClick={() => setSelectedType(ISSUE_TYPES.REPAIRS)}
          style={{
            padding: '0.75rem 1.5rem',
            border: 'none',
            backgroundColor: 'transparent',
            color: selectedType === ISSUE_TYPES.REPAIRS ? '#3b82f6' : '#6b7280',
            fontWeight: selectedType === ISSUE_TYPES.REPAIRS ? '600' : '500',
            borderBottom: selectedType === ISSUE_TYPES.REPAIRS ? '2px solid #3b82f6' : '2px solid transparent',
            marginBottom: '-2px',
            cursor: 'pointer'
          }}
        >
          Repairs ({repairsIssues.length})
        </button>
        <button
          onClick={() => setSelectedType(ISSUE_TYPES.GROUNDS_MAINTENANCE)}
          style={{
            padding: '0.75rem 1.5rem',
            border: 'none',
            backgroundColor: 'transparent',
            color: selectedType === ISSUE_TYPES.GROUNDS_MAINTENANCE ? '#3b82f6' : '#6b7280',
            fontWeight: selectedType === ISSUE_TYPES.GROUNDS_MAINTENANCE ? '600' : '500',
            borderBottom: selectedType === ISSUE_TYPES.GROUNDS_MAINTENANCE ? '2px solid #3b82f6' : '2px solid transparent',
            marginBottom: '-2px',
            cursor: 'pointer'
          }}
        >
          Grounds Maintenance ({groundsIssues.length})
        </button>
        <button
          onClick={() => setSelectedType(ISSUE_TYPES.CLEANING)}
          style={{
            padding: '0.75rem 1.5rem',
            border: 'none',
            backgroundColor: 'transparent',
            color: selectedType === ISSUE_TYPES.CLEANING ? '#3b82f6' : '#6b7280',
            fontWeight: selectedType === ISSUE_TYPES.CLEANING ? '600' : '500',
            borderBottom: selectedType === ISSUE_TYPES.CLEANING ? '2px solid #3b82f6' : '2px solid transparent',
            marginBottom: '-2px',
            cursor: 'pointer'
          }}
        >
          Cleaning ({cleaningIssues.length})
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
          Loading actions...
        </div>
      ) : filteredIssues.length === 0 ? (
        <div style={{
          backgroundColor: 'white',
          padding: '3rem',
          borderRadius: '0.5rem',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          textAlign: 'center'
        }}>
          <p style={{ fontSize: '1.125rem', color: '#6b7280' }}>
            No {selectedType === 'all' ? 'actions' : ISSUE_TYPE_LABELS[selectedType].toLowerCase()} found
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {filteredIssues.map((issue) => {
            const statusColors = getStatusColor(issue.status)
            return (
              <div
                key={issue.id}
                style={{
                  backgroundColor: 'white',
                  padding: '1.5rem',
                  borderRadius: '0.5rem',
                  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
                  border: '1px solid #e5e7eb'
                }}
              >
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: '1rem'
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{
                      display: 'flex',
                      gap: '1rem',
                      alignItems: 'center',
                      marginBottom: '0.5rem'
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
                        backgroundColor: statusColors.bg,
                        color: statusColors.text,
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
                      margin: 0,
                      fontSize: '0.75rem',
                      color: '#9ca3af',
                    }}>
                      Created: {formatDate(issue.createdAt)}
                    </p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
