'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getAllIssues, ISSUE_TYPE_LABELS, ISSUE_STATUS_LABELS } from '@/lib/issues'

export default function InspectionsPage() {
  const [issues, setIssues] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')

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

  const filteredIssues = issues.filter(issue => {
    const matchesSearch = issue.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (issue.description && issue.description.toLowerCase().includes(searchTerm.toLowerCase())) ||
                         (issue.location && issue.location.toLowerCase().includes(searchTerm.toLowerCase()))
    const matchesType = filterType === 'all' || issue.type === filterType
    const matchesStatus = filterStatus === 'all' || issue.status === filterStatus
    return matchesSearch && matchesType && matchesStatus
  })

  return (
    <div>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '2rem'
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 'bold', color: '#111827' }}>
            Inspections
          </h1>
          <p style={{ margin: '0.5rem 0 0 0', color: '#6b7280' }}>
            View and manage estate inspections
          </p>
        </div>
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
          + New Issue
        </Link>
      </div>

      {/* Search and Filters */}
      <div style={{
        backgroundColor: 'white',
        padding: '1.5rem',
        borderRadius: '0.5rem',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        marginBottom: '1.5rem'
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '1rem' }}>
          <input
            type="text"
            placeholder="Search by title, description, or location..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              padding: '0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '1rem'
            }}
          />
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            style={{
              padding: '0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '1rem',
              backgroundColor: 'white'
            }}
          >
            <option value="all">All Types</option>
            <option value="repairs">Repairs</option>
            <option value="grounds_maintenance">Grounds Maintenance</option>
            <option value="cleaning">Cleaning</option>
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            style={{
              padding: '0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '1rem',
              backgroundColor: 'white'
            }}
          >
            <option value="all">All Statuses</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
          </select>
        </div>
      </div>

      {/* Issues List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
          Loading inspections...
        </div>
      ) : filteredIssues.length === 0 ? (
        <div style={{
          backgroundColor: 'white',
          padding: '3rem',
          borderRadius: '0.5rem',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          textAlign: 'center'
        }}>
          <p style={{ fontSize: '1.125rem', color: '#6b7280', marginBottom: '1rem' }}>
            {searchTerm || filterType !== 'all' || filterStatus !== 'all' 
              ? 'No inspections match your filters'
              : 'No inspections yet'}
          </p>
          {!searchTerm && filterType === 'all' && filterStatus === 'all' && (
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
              Start Your First Inspection
            </Link>
          )}
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gap: '1rem'
        }}>
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
