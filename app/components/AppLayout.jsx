'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import {
  useAuth,
  SignInButton,
  SignUpButton,
  SignedIn,
  SignedOut,
  UserButton,
} from '@clerk/nextjs'
import { colours } from '@/lib/nv-theme'
import { photobook } from '@/lib/photobook-theme'

const ALL_NAV_ITEMS = [
  { href: '/', label: 'Home', navKey: 'home' },
  { href: '/inspections', label: 'Manage Inspections', navKey: 'inspections' },
  { href: '/actions', label: 'Issues / Actions', navKey: 'actions' },
  { href: '/repairs-inspector', label: 'Repairs Updates', navKey: 'repairsInspector' },
  { href: '/repairs-inspector/new', label: 'Repairs Form', navKey: 'repairsInspectorForm' },
  { href: '/templates', label: 'Forms', navKey: 'templates' },
  { href: '/caretaker/my-inspections', label: 'My inspections', navKey: 'myInspections' },
  { href: '/reports/inspections', label: 'Inspection reports', navKey: 'inspectionReports' },
  { href: '/guides', label: 'Guides', navKey: 'guides' },
  { href: '/settings', label: 'Settings', navKey: 'settings' },
  { href: '/downloads', label: 'Data Download', navKey: 'downloads' },
  { href: '/analytics', label: 'Analytics', navKey: 'analytics' },
]

/** Hidden when signed out (admin pages require login). */
const ADMIN_ONLY_NAV_HREFS = new Set(['/settings', '/import'])

/** Croydon Housing + Council horizontal banner (`public/croydon-housing-logo.svg`, white background) */
const LOGO_SRC = '/croydon-housing-logo.svg'

const logoBannerWrap = {
  display: 'inline-flex',
  alignItems: 'center',
  backgroundColor: '#fff',
  borderRadius: 8,
  padding: '6px 12px',
  lineHeight: 0,
}

export default function AppLayout({ children }) {
  const pathname = usePathname()
  const router = useRouter()
  const { isSignedIn, isLoaded: authLoaded } = useAuth()
  const [appRole, setAppRole] = useState(null)
  const [clerkIsAdmin, setClerkIsAdmin] = useState(false)
  const [roleUi, setRoleUi] = useState(null)

  useEffect(() => {
    if (!authLoaded || !isSignedIn) {
      setAppRole(null)
      setClerkIsAdmin(false)
      setRoleUi(null)
      return
    }
    let cancelled = false
    fetch('/api/auth/me', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : {}))
      .then((data) => {
        if (cancelled) return
        setAppRole(typeof data?.role === 'string' ? data.role : null)
        setClerkIsAdmin(data?.clerkIsAdmin === true)
        setRoleUi(data?.roleUi && typeof data.roleUi === 'object' ? data.roleUi : null)
      })
      .catch(() => {
        if (!cancelled) {
          setAppRole(null)
          setClerkIsAdmin(false)
          setRoleUi(null)
        }
      })
    return () => {
      cancelled = true
    }
  }, [authLoaded, isSignedIn])

  useEffect(() => {
    if (!isSignedIn || roleUi?.normalizedRole !== 'caretaker' || !pathname) return
    const inspectionDetailPath =
      pathname.startsWith('/inspections/') &&
      !pathname.startsWith('/inspections/new')
    const allowed =
      pathname === '/templates' ||
      pathname.startsWith('/caretaker/my-inspections') ||
      pathname.startsWith('/guides') ||
      pathname.startsWith('/inspections/new') ||
      inspectionDetailPath
    if (!allowed) router.replace('/templates')
  }, [isSignedIn, pathname, roleUi, router])

  const navItems = useMemo(() => {
    if (!isSignedIn) {
      return ALL_NAV_ITEMS.filter((item) => !ADMIN_ONLY_NAV_HREFS.has(item.href))
    }
    const nav = roleUi?.nav
    if (nav && typeof nav === 'object') {
      return ALL_NAV_ITEMS.filter((item) => nav[item.navKey] === true)
    }
    // Before roleUi loads: show a safe subset (no admin-only links)
    return ALL_NAV_ITEMS.filter((item) => !ADMIN_ONLY_NAV_HREFS.has(item.href))
  }, [isSignedIn, roleUi])

  const isActive = (href) => {
    if (href === '/') return pathname === '/' || pathname === '/dashboard'
    // /inspections/new is launched from Forms; keep "Manage Inspections" active only for list + inspection sub-routes
    if (href === '/inspections') {
      if (!pathname) return false
      if (pathname === '/inspections' || pathname === '/inspections/') return true
      if (pathname.startsWith('/inspections/new')) return false
      return pathname.startsWith('/inspections/')
    }
    if (href === '/reports/inspections') return pathname?.startsWith('/reports/inspections')
    if (href === '/caretaker/my-inspections') return pathname?.startsWith('/caretaker/my-inspections')
    if (href === '/repairs-inspector') return pathname === '/repairs-inspector'
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
        backgroundColor: photobook.soft,
        borderBottom: `1px solid ${photobook.softBorder}`,
        padding: '0.65rem 0.85rem',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        boxShadow: '0 1px 3px rgba(88, 28, 135, 0.08)'
      }}>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.45rem',
          minHeight: '52px',
        }}>
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.5rem',
            rowGap: '0.35rem',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', minWidth: 0, flex: '1 1 auto' }}>
              <Link href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', flexShrink: 0 }} aria-label="Croydon Housing and Croydon Council – Home">
                <span style={logoBannerWrap}>
                  <img
                    src={LOGO_SRC}
                    alt="Croydon Housing and Croydon Council"
                    fetchPriority="high"
                    decoding="async"
                    style={{
                      height: 'clamp(34px, 5.5vw, 48px)',
                      width: 'auto',
                      maxWidth: 'min(440px, 92vw)',
                      objectFit: 'contain',
                    }}
                  />
                </span>
              </Link>
              <h1 style={{
                margin: 0,
                fontSize: 'clamp(0.9375rem, 2.2vw, 1.2rem)',
                fontWeight: 'bold',
                color: photobook.heading,
                whiteSpace: 'nowrap',
              }}>
                Estate Inspection
              </h1>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: '0.5rem',
                flexShrink: 0,
                flexWrap: 'wrap',
              }}
            >
            <SignedOut>
              <SignInButton mode="modal" fallbackRedirectUrl={pathname || '/'}>
                <button
                  type="button"
                  style={{
                    padding: '0.5rem 1.1rem',
                    backgroundColor: photobook.primary,
                    color: '#fff',
                    border: 'none',
                    borderRadius: '0.5rem',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: '0.9375rem',
                    boxShadow: '0 1px 3px rgba(192, 38, 211, 0.35)',
                  }}
                >
                  Sign in
                </button>
              </SignInButton>
              <SignUpButton mode="modal" fallbackRedirectUrl={pathname || '/'}>
                <button
                  type="button"
                  style={{
                    padding: '0.5rem 1rem',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: '0.875rem',
                    color: photobook.primary,
                    backgroundColor: '#fff',
                    border: `2px solid ${photobook.primary}`,
                    borderRadius: '0.5rem',
                  }}
                >
                  Sign up
                </button>
              </SignUpButton>
            </SignedOut>
            <SignedIn>
              <UserButton afterSignOutUrl="/login" />
            </SignedIn>
            </div>
          </div>
          <nav
            aria-label="Main"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: '0.15rem',
              rowGap: '0.25rem',
              width: '100%',
              minWidth: 0,
              paddingTop: '0.05rem',
              borderTop: `1px solid ${photobook.softBorder}`,
            }}
          >
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  padding: '0.38rem 0.48rem',
                  color: isActive(item.href) ? photobook.primary : colours.neutral.muted,
                  textDecoration: 'none',
                  fontWeight: isActive(item.href) ? '600' : '500',
                  borderBottom: isActive(item.href) ? `2px solid ${photobook.primary}` : '2px solid transparent',
                  marginBottom: '-1px',
                  transition: 'all 0.2s',
                  fontSize: 'clamp(0.75rem, 1.25vw, 0.875rem)',
                  lineHeight: 1.25,
                }}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <SignedIn>
            {roleUi?.accessMessage ? (
              <div
                role="status"
                style={{
                  padding: '0.45rem 0.65rem',
                  border: '1px solid #f59e0b',
                  borderRadius: '0.375rem',
                  background: '#fffbeb',
                  color: '#92400e',
                  fontSize: '0.8125rem',
                  lineHeight: 1.35,
                }}
              >
                {roleUi.accessMessage}
              </div>
            ) : null}
          </SignedIn>
        </div>
      </header>
      <main style={{
        flex: 1,
        padding: '2rem',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch'
      }}>
        {children}
      </main>
    </div>
  )
}
