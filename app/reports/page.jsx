'use client'

import Link from 'next/link'
import { photobook } from '@/lib/photobook-theme'

export default function ReportsPage() {
  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 'bold', color: '#111827' }}>
          Reports
        </h1>
        <p style={{ margin: '0.5rem 0 0 0', color: '#6b7280' }}>
          Manager and HOS tools backed by live Neon inspection data.
        </p>
      </div>

      <div
        style={{
          backgroundColor: 'white',
          padding: '1.5rem',
          borderRadius: '0.75rem',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08)',
          border: `1px solid ${photobook.softBorder}`,
        }}
      >
        <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1.125rem', color: '#111827' }}>Inspections summary</h2>
        <p style={{ fontSize: '0.9375rem', color: '#6b7280', marginBottom: '1rem', lineHeight: 1.5 }}>
          Filter by area, estate, block, template, type, quarter or date range, and status. Export CSV, print, or save
          the view as PDF from the browser.
        </p>
        <Link
          href="/reports/inspections"
          style={{
            display: 'inline-block',
            padding: '0.6rem 1.2rem',
            backgroundColor: photobook.primary,
            color: '#fff',
            fontWeight: 600,
            borderRadius: 8,
            textDecoration: 'none',
          }}
        >
          Open inspections report
        </Link>
      </div>
    </div>
  )
}
