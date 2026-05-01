'use client'

const GUIDE_URL = '/guides/best-practice-guide.pdf'

export default function GuidesPage() {
  return (
    <div>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 'bold', color: '#111827' }}>
          Guides
        </h1>
        <p style={{ margin: '0.5rem 0 0 0', color: '#6b7280' }}>
          Guidance and best practices for estate inspections
        </p>
      </div>

      <div style={{
        backgroundColor: 'white',
        padding: '1.5rem',
        borderRadius: '0.5rem',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        textAlign: 'left'
      }}>
        <a href={GUIDE_URL} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', padding: '0.75rem 1rem', border: '1px solid #1d4ed8', borderRadius: 8, background: '#1d4ed8', color: '#fff', textDecoration: 'none', fontWeight: 700 }}>
          Open Best Practice Guide
        </a>
        <p style={{ margin: '1rem 0 0', color: '#64748b', fontSize: '0.875rem' }}>
          If the guide does not open, check that the PDF exists at /public/guides/best-practice-guide.pdf.
        </p>
      </div>
    </div>
  )
}
