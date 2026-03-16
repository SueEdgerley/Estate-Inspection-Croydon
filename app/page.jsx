import Link from 'next/link'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { resolveCurrentUserAccess } from '@/lib/permissions'

export default async function Home() {
  const { userId } = await auth()

  if (userId) {
    const access = await resolveCurrentUserAccess()
    if (access?.permissions?.dashboard && !access?.denialCode) {
      console.log('[Home] redirecting signed-in user to /dashboard', {
        clerkUserId: access.clerkUserId ?? null,
        appRole: access.appRole ?? null,
      })
      redirect('/dashboard')
    }

    console.log('[Home] no redirect for signed-in user', {
      clerkUserId: access?.clerkUserId ?? null,
      appRole: access?.appRole ?? null,
      denialCode: access?.denialCode ?? null,
    })
  } else {
    console.log('[Home] user is signed out, staying on entry page')
  }

  return (
    <main style={{ maxWidth: '42rem', margin: '4rem auto', padding: '0 1rem', textAlign: 'center' }}>
      <h1 style={{ marginBottom: '0.75rem' }}>Estate Inspection App</h1>
      <p style={{ color: '#4b5563', marginBottom: '1.5rem' }}>
        Sign in to continue. Users with valid access are redirected to the dashboard.
      </p>
      <Link
        href="/login"
        style={{
          display: 'inline-block',
          padding: '0.75rem 1.25rem',
          backgroundColor: '#0f766e',
          color: '#fff',
          borderRadius: '0.5rem',
          textDecoration: 'none',
          fontWeight: 600,
        }}
      >
        Sign in
      </Link>
    </main>
  )
}
