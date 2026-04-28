'use client'

import Link from 'next/link'

export default function AdminPage() {
  return (
    <div>
      <h1>Admin</h1>
      <ul>
        <li><Link href="/settings">Settings</Link> – Manage Users and Issue Recipients (Phase 1)</li>
        <li><Link href="/admin/cost-codes">Cost codes</Link> – add and maintain active cost code options for inspection dropdowns</li>
        <li><Link href="/admin/best-practice-guides">Best Practice Guides</Link> – upload PDF guides linked to forms/templates</li>
        <li><Link href="/admin/caretaker-schedules">Caretaker schedules</Link> – recurring caretaker-only operational work</li>
        <li><Link href="/admin/assignments">Assignments</Link> – time-bounded assignments (starts_at, ends_at), temporary cover</li>
        <li><Link href="/admin/estates">Estates</Link> – create and manage estates</li>
        <li><Link href="/admin/blocks">Blocks</Link> – create and manage blocks (optional link to estate)</li>
      </ul>
      <p style={{ marginTop: '1.5rem' }}>
        <a href="/api/phase1-checklist" target="_blank" rel="noopener noreferrer">Phase 1 checklist</a> – verify tables, inspection storage, PDFs, tasks/emails.
      </p>
    </div>
  )
}
