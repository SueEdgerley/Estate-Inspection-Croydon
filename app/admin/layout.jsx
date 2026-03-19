import Link from 'next/link'
import { requireAdminPageAccess } from '@/lib/page-access'

export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }) {
  await requireAdminPageAccess()

  return (
    <div style={{ padding: '1rem 2rem' }}>
      <nav style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem' }}>
        <Link href="/admin">Admin</Link>
        <Link href="/admin/users">Users</Link>
        <Link href="/admin/assignments">Assignments</Link>
        <Link href="/admin/estates">Estates</Link>
        <Link href="/admin/blocks">Blocks</Link>
        <Link href="/admin/inspections">Inspections</Link>
        <Link href="/dashboard">Dashboard</Link>
      </nav>
      {children}
    </div>
  )
}
