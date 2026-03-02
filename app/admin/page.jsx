'use client'

import Link from 'next/link'

export default function AdminPage() {
  return (
    <div>
      <h1>Admin</h1>
      <ul>
        <li><Link href="/admin/users">User management</Link> – add user, deactivate, change role (caretaker, esm, housing officer, admin)</li>
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
