'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function DashboardLayout({ children }) {
  const pathname = usePathname()

  const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: '🏠' },
    { href: '/inspections', label: 'Inspections', icon: '🔍' },
    { href: '/actions', label: 'Actions', icon: '⚡' },
    { href: '/templates', label: 'Templates', icon: '📋' },
    { href: '/guides/best-practice-guide.pdf', label: 'Best Practice Guide', icon: '📘', external: true },
  ]

  const isActive = (href) => {
    if (href === '/dashboard') {
      return pathname === '/dashboard' || pathname === '/'
    }
    return pathname?.startsWith(href)
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f9fafb' }}>
      {/* Sidebar */}
      <aside style={{
        width: '250px',
        backgroundColor: '#fff',
        borderRight: '1px solid #e5e7eb',
        padding: '1.5rem 0',
        position: 'sticky',
        top: 0,
        height: '100vh',
        overflowY: 'auto'
      }}>
        <div style={{ padding: '0 1.5rem', marginBottom: '2rem' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            backgroundColor: '#fff',
            borderRadius: 8,
            padding: '6px 12px',
            lineHeight: 0,
            marginBottom: '0.75rem',
          }}>
            <img
              src="/croydon-housing-logo.svg"
              alt="Croydon Council"
              style={{ height: 36, width: 'auto', maxWidth: '100%', objectFit: 'contain' }}
            />
          </div>
          <h1 style={{
            margin: 0,
            fontSize: '1.5rem',
            fontWeight: 'bold',
            color: '#111827'
          }}>
            Estate Inspection
          </h1>
        </div>

        <nav>
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              target={item.external ? '_blank' : undefined}
              rel={item.external ? 'noopener noreferrer' : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '0.75rem 1.5rem',
                color: isActive(item.href) ? '#3b82f6' : '#374151',
                textDecoration: 'none',
                backgroundColor: isActive(item.href) ? '#eff6ff' : 'transparent',
                borderLeft: isActive(item.href) ? '3px solid #3b82f6' : '3px solid transparent',
                fontWeight: isActive(item.href) ? '600' : '500',
                transition: 'all 0.2s'
              }}
            >
              <span style={{ marginRight: '0.75rem', fontSize: '1.25rem' }}>
                {item.icon}
              </span>
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      {/* Main Content */}
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
