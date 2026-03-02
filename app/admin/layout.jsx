'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function AdminLayout({ children }) {
  const [allowed, setAllowed] = useState(null)
  const router = useRouter()

  useEffect(() => {
    fetch('/api/admin/users', { credentials: 'include' })
      .then((res) => {
        if (res.status === 403 || res.status === 401) {
          setAllowed(false)
          return
        }
        setAllowed(res.ok)
      })
      .catch(() => setAllowed(false))
  }, [])

  if (allowed === null) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Checking access…</p>
      </div>
    )
  }
  if (!allowed) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>You don’t have permission to view this area.</p>
        <Link href="/dashboard">Back to dashboard</Link>
      </div>
    )
  }

  return (
    <div style={{ padding: '1rem 2rem' }}>
      <nav style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem' }}>
        <Link href="/admin">Admin</Link>
        <Link href="/admin/users">Users</Link>
        <Link href="/admin/assignments">Assignments</Link>
        <Link href="/admin/estates">Estates</Link>
        <Link href="/admin/blocks">Blocks</Link>
        <Link href="/dashboard">Dashboard</Link>
      </nav>
      {children}
    </div>
  )
}
