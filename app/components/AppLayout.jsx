'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  SignInButton,
  SignUpButton,
  SignedIn,
  SignedOut,
  UserButton,
} from '@clerk/nextjs'
import { colours } from '@/lib/nv-theme'

export default function AppLayout({ children }) {
  const pathname = usePathname()

  const navItems = [
    { href: '/', label: 'Home' },
    { href: '/inspections', label: 'Manage Inspections' },
    { href: '/inspections/ad-hoc', label: 'Create Ad Hoc Inspection' },
    { href: '/actions', label: 'Manage Tasks' },
    { href: '/templates', label: 'Templates' },
    { href: '/import', label: 'Import' },
    { href: '/guides', label: 'Best Practice Guides' },
    { href: '/settings', label: 'Settings' },
    { href: '/downloads', label: 'Data Download' },
    { href: '/analytics', label: 'Analytics' },
  ]

  const isActive = (href) => {
    if (href === '/') return pathname === '/' || pathname === '/dashboard'
    // /inspections/new is the create form; keep "Manage Inspections" active only for list + inspection sub-routes
    if (href === '/inspections') {
      if (!pathname) return false
      if (pathname.startsWith('/inspections/ad-hoc')) return false
      if (pathname === '/inspections' || pathname === '/inspections/') return true
      if (pathname.startsWith('/inspections/new')) return false
      return pathname.startsWith('/inspections/')
    }
    return pathname?.startsWith(href)
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100vh',
      backgroundColor: '#f9fafb'
    }}>
      <header style={{
        backgroundColor: colours.neutral.card,
        borderBottom: `1px solid ${colours.neutral.border}`,
        padding: '0 1.25rem 0 1rem',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08)'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          minHeight: '64px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <Link href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }} aria-label="Croydon Council – Home">
              <img
                src="/croydon-housing-logo.png"
                alt="Croydon Council"
                style={{ height: 40, width: 'auto', maxWidth: 220, objectFit: 'contain' }}
              />
            </Link>
            <h1 style={{
              margin: 0,
              fontSize: '1.25rem',
              fontWeight: 'bold',
              color: colours.neutral.text,
              marginRight: '1rem'
            }}>
              Estate Inspection
            </h1>
            <nav style={{ display: 'flex', gap: '0.5rem' }}>
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{
                    padding: '0.75rem 1rem',
                    color: isActive(item.href) ? colours.primary : colours.neutral.muted,
                    textDecoration: 'none',
                    fontWeight: isActive(item.href) ? '600' : '500',
                    borderBottom: isActive(item.href) ? `2px solid ${colours.primary}` : '2px solid transparent',
                    marginBottom: '-1px',
                    transition: 'all 0.2s',
                    fontSize: '0.9375rem'
                  }}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ fontSize: '0.875rem', color: colours.neutral.muted }}>Croydon Council</span>
            <SignedOut>
              <SignInButton mode="modal">
                <button type="button" style={{ padding: '0.5rem 1rem', marginRight: '0.5rem', cursor: 'pointer', fontWeight: 500 }}>Sign in</button>
              </SignInButton>
              <SignUpButton mode="modal">
                <button type="button" style={{ padding: '0.5rem 1rem', cursor: 'pointer', fontWeight: 500 }}>Sign up</button>
              </SignUpButton>
            </SignedOut>
            <SignedIn>
              <UserButton afterSignOutUrl="/login" />
            </SignedIn>
          </div>
        </div>
      </header>
      <main style={{
        flex: 1,
        padding: '2rem',
        overflowY: 'auto'
      }}>
        {children}
      </main>
    </div>
  )
}
