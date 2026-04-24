'use client'

import Link from 'next/link'
import { photobook } from '@/lib/photobook-theme'

const cardStyle = {
  backgroundColor: 'white',
  padding: '1.5rem',
  borderRadius: '0.75rem',
  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08)',
  border: `1px solid ${photobook.softBorder}`,
  marginBottom: '1.25rem',
}

const linkBtn = {
  display: 'inline-block',
  padding: '0.6rem 1.2rem',
  backgroundColor: photobook.primary,
  color: '#fff',
  fontWeight: 600,
  borderRadius: 8,
  textDecoration: 'none',
}

export default function ReportsPage() {
  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 'bold', color: '#111827' }}>
          Reports
        </h1>
        <p style={{ margin: '0.5rem 0 0 0', color: '#6b7280' }}>
          Manager and HOS tools for inspection summaries and analytics. Where you see <strong>Print / Save as PDF</strong>, use
          your browser to save a copy. Full inspection record PDFs and resident issue sheets are generated from the app when
          you use those actions.
        </p>
      </div>

      <div style={cardStyle}>
        <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1.125rem', color: '#111827' }}>Inspections summary</h2>
        <p style={{ fontSize: '0.9375rem', color: '#6b7280', marginBottom: '1rem', lineHeight: 1.5 }}>
          Filter by area, estate, block, template, type, quarter or date range, and status. Export CSV or open{' '}
          <strong>Printable / Save as PDF</strong> from the report page.
        </p>
        <Link href="/reports/inspections" style={linkBtn}>
          Open inspections report
        </Link>
      </div>

      <div style={cardStyle}>
        <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1.125rem', color: '#111827' }}>Analytics &amp; manager summary</h2>
        <p style={{ fontSize: '0.9375rem', color: '#6b7280', marginBottom: '1rem', lineHeight: 1.5 }}>
          Trends, issue hotspots, caretaker throughput, and C/D grade risk. Use <strong>Print / save as PDF</strong> on
          the Analytics page for a manager PDF; export summary CSV from there if needed.
        </p>
        <Link href="/analytics" style={linkBtn}>
          Open analytics
        </Link>
      </div>
    </div>
  )
}
