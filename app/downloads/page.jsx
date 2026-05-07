'use client'

import { useState } from 'react'

export default function DownloadsPage() {
  const [activeTab, setActiveTab] = useState('inspections')
  const [downloading, setDownloading] = useState(null)

  const handleDownload = async (params) => {
    const key = Object.keys(params).length ? Object.entries(params).map(([k, v]) => `${k}=${v}`).join('&') : 'all'
    setDownloading(key)
    try {
      const qs = new URLSearchParams(params).toString()
      const response = await fetch(`/api/dashboard/download?${qs}`, { credentials: 'include' })
      if (!response.ok) throw new Error('Download failed')
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const disp = response.headers.get('Content-Disposition')
      const match = disp && disp.match(/filename="?([^"]+)"?/)
      const date = new Date().toISOString().split('T')[0]
      const filename = match ? match[1].trim() : (params.tab === 'tasks' && params.taskType ? `tasks-${params.taskType}-${date}.csv` : params.dataType ? `inspections-${params.dataType}-${date}.csv` : `inspections-${date}.csv`)
      a.download = filename
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (err) {
      console.error(err)
      alert(err.message || 'Download failed. Check that the database is configured.')
    } finally {
      setDownloading(null)
    }
  }

  const filterButton = (label, params, dataType) => {
    const key = dataType || label.toLowerCase().replace(/\s+/g, '_')
    const isActive = downloading === (dataType || key)
    return (
      <button
        key={key}
        type="button"
        disabled={!!downloading}
        onClick={() => handleDownload({ ...params, ...(dataType ? { dataType } : {}) })}
        style={{
          padding: '0.5rem 1rem',
          marginRight: '0.5rem',
          marginBottom: '0.5rem',
          backgroundColor: isActive ? '#3b82f6' : '#f3f4f6',
          color: isActive ? 'white' : '#374151',
          border: '1px solid #d1d5db',
          borderRadius: '0.375rem',
          cursor: downloading && !isActive ? 'not-allowed' : 'pointer',
          fontWeight: 500,
          fontSize: '0.9375rem',
        }}
      >
        {isActive ? 'Downloading…' : label}
      </button>
    )
  }

  return (
    <div>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 'bold', color: '#111827' }}>
          Data Download
        </h1>
        <p style={{ margin: '0.5rem 0 0 0', color: '#6b7280' }}>
          Download inspection data and reports
        </p>
      </div>

      <div style={{
        backgroundColor: 'white',
        borderRadius: '0.5rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb' }}>
          <button
            type="button"
            onClick={() => setActiveTab('inspections')}
            style={{
              padding: '1rem 1.5rem',
              border: 'none',
              borderBottom: activeTab === 'inspections' ? '2px solid #3b82f6' : '2px solid transparent',
              background: activeTab === 'inspections' ? '#f9fafb' : 'transparent',
              color: activeTab === 'inspections' ? '#111827' : '#6b7280',
              fontWeight: 500,
              cursor: 'pointer',
              fontSize: '1rem',
            }}
          >
            Inspections
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('tasks')}
            style={{
              padding: '1rem 1.5rem',
              border: 'none',
              borderBottom: activeTab === 'tasks' ? '2px solid #3b82f6' : '2px solid transparent',
              background: activeTab === 'tasks' ? '#f9fafb' : 'transparent',
              color: activeTab === 'tasks' ? '#111827' : '#6b7280',
              fontWeight: 500,
              cursor: 'pointer',
              fontSize: '1rem',
            }}
          >
            Issues / Actions
          </button>
        </div>

        {activeTab === 'inspections' && (
          <div style={{ padding: '1.5rem 1.5rem 2rem' }}>
            <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.125rem', fontWeight: 600, color: '#374151' }}>
              Data type
            </h2>
            <p style={{ margin: '0 0 1.25rem', fontSize: '0.875rem', color: '#6b7280' }}>
              Choose the type of data you wish to download
            </p>

            <div style={{ marginBottom: '1.5rem' }}>
              <p style={{ margin: '0 0 0.5rem', fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>
                Inspections
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {filterButton('Completed', { status: 'submitted' }, 'completed')}
              </div>
            </div>

            <div>
              <p style={{ margin: '0 0 0.5rem', fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>
                Questions &amp; Answers
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {filterButton('Completed', { dataType: 'questions_answers' }, 'questions_answers')}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'tasks' && (
          <div style={{ padding: '1.5rem 1.5rem 2rem' }}>
            <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.125rem', fontWeight: 600, color: '#374151' }}>
              Data type
            </h2>
            <p style={{ margin: '0 0 1.25rem', fontSize: '0.875rem', color: '#6b7280' }}>
              Choose the type of data you wish to download
            </p>
            <div>
              <p style={{ margin: '0 0 0.5rem', fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>
                Issues / Actions
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {filterButton('Raised', { tab: 'tasks', taskType: 'raised' }, 'tasks_raised')}
                {filterButton('Completed', { tab: 'tasks', taskType: 'completed' }, 'tasks_completed')}
                {filterButton('Outstanding', { tab: 'tasks', taskType: 'outstanding' }, 'tasks_outstanding')}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
