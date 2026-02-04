'use client'

export default function DownloadsPage() {
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
        padding: '3rem',
        borderRadius: '0.5rem',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        textAlign: 'center'
      }}>
        <p style={{ fontSize: '1.125rem', color: '#6b7280', marginBottom: '1rem' }}>
          Data Download options coming soon
        </p>
        <p style={{ fontSize: '0.875rem', color: '#9ca3af' }}>
          This page will provide options to download inspection data in various formats.
        </p>
      </div>
    </div>
  )
}
