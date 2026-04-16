'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/** User management moved to Settings → Manage Users (Phase 1). */
export default function AdminUsersRedirectPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/settings#manage-users')
  }, [router])
  return (
    <div style={{ padding: '2rem' }}>
      <p>Redirecting to Settings…</p>
    </div>
  )
}
