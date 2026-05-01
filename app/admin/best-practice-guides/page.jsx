'use client'

const GUIDE_URL = '/guides/best-practice-guide.pdf'

export default function AdminBestPracticeGuidesPage() {
  return (
    <div style={{ maxWidth: 900 }}>
      <h1>Best Practice Guide</h1>
      <p style={{ color: '#64748b' }}>
        Admin upload is disabled for now. The app is using one static PDF guide.
      </p>
      <a
        href={GUIDE_URL}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'inline-flex',
          padding: '0.75rem 1rem',
          border: '1px solid #1d4ed8',
          borderRadius: 8,
          background: '#1d4ed8',
          color: '#fff',
          textDecoration: 'none',
          fontWeight: 700,
        }}
      >
        Open Best Practice Guide
      </a>
      <p style={{ marginTop: '1rem', color: '#64748b', fontSize: '0.875rem' }}>
        If the guide does not open, check that the PDF exists at /public/guides/best-practice-guide.pdf.
      </p>
    </div>
  )
}
