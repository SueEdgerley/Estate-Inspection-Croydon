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

export default function AppLayout({ children }) {
  const pathname = usePathname()

  const navItems = [
    { href: '/', label: 'Home' },
    { href: '/inspections', label: 'Manage Inspections' },
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
        backgroundColor: '#fff',
        borderBottom: '1px solid #e5e7eb',
        padding: '0 2rem',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: '64px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <h1 style={{
              margin: 0,
              fontSize: '1.25rem',
              fontWeight: 'bold',
              color: '#111827',
              marginRight: '2rem'
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
                    color: isActive(item.href) ? '#3b82f6' : '#6b7280',
                    textDecoration: 'none',
                    fontWeight: isActive(item.href) ? '600' : '500',
                    borderBottom: isActive(item.href) ? '2px solid #3b82f6' : '2px solid transparent',
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
            <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>Croydon Council</span>
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
