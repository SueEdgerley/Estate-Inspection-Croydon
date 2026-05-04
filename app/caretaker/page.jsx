'use client'

import { useEffect, useMemo, useState } from 'react'
import { SignInButton, SignedIn, SignedOut } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { photobook } from '@/lib/photobook-theme'

export default function CaretakerLandingPage() {
  const router = useRouter()
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function loadTemplates() {
      setLoading(true)
      setError('')
      try {
        const response = await fetch('/api/templates', { credentials: 'include', cache: 'no-store' })
        const data = await response.json().catch(() => ({}))
        if (cancelled) return
        if (!response.ok) {
          setError(data?.details || data?.error || `Could not load caretaker form (${response.status})`)
          setTemplates([])
          return
        }
        setTemplates(Array.isArray(data?.templates) ? data.templates : [])
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Could not load caretaker form')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadTemplates()
    return () => {
      cancelled = true
    }
  }, [])

  const caretakerTemplate = useMemo(() => {
    return templates.find((template) => {
      const blob = `${template?.name || ''} ${template?.template_key || ''} ${template?.template_type || ''} ${template?.type || ''}`.toLowerCase()
      return blob.includes('caretaker')
    }) || templates[0]
  }, [templates])

  const startCaretakerInspection = () => {
    if (!caretakerTemplate?.id) return
    router.push(`/inspections/new?template_id=${encodeURIComponent(caretakerTemplate.id)}`)
  }

  return (
    <div
      style={{
        minHeight: 'calc(100vh - 12rem)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '34rem',
          textAlign: 'center',
          background: '#fff',
          border: `1px solid ${photobook.softBorder}`,
          borderRadius: '1rem',
          padding: '2rem',
          boxShadow: '0 8px 24px rgba(88, 28, 135, 0.12)',
        }}
      >
        <h1 style={{ margin: '0 0 0.5rem', color: photobook.heading, fontSize: '1.75rem' }}>
          Caretaker Inspection
        </h1>
        <p style={{ margin: '0 0 1.5rem', color: '#4b5563', lineHeight: 1.5 }}>
          Start your caretaker inspection form from here.
        </p>

        <SignedOut>
          <SignInButton mode="modal" forceRedirectUrl="/caretaker">
            <button
              type="button"
              style={{
                width: '100%',
                padding: '1rem 1.25rem',
                borderRadius: '0.75rem',
                border: 'none',
                background: photobook.primary,
                color: '#fff',
                fontSize: '1.1rem',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              Sign in to start inspection
            </button>
          </SignInButton>
        </SignedOut>

        <SignedIn>
          {error ? (
            <p style={{ color: '#b91c1c', margin: '0 0 1rem' }}>{error}</p>
          ) : null}
          <button
            type="button"
            onClick={startCaretakerInspection}
            disabled={loading || !caretakerTemplate?.id}
            style={{
              width: '100%',
              padding: '1.1rem 1.25rem',
              borderRadius: '0.75rem',
              border: 'none',
              background: loading || !caretakerTemplate?.id ? '#9ca3af' : photobook.primary,
              color: '#fff',
              fontSize: '1.15rem',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.02em',
              cursor: loading || !caretakerTemplate?.id ? 'wait' : 'pointer',
              boxShadow: loading || !caretakerTemplate?.id ? 'none' : '0 6px 18px rgba(111, 44, 145, 0.28)',
            }}
          >
            {loading ? 'Loading form...' : 'Start Caretaker Inspection'}
          </button>
          {!loading && !caretakerTemplate?.id ? (
            <p style={{ margin: '1rem 0 0', color: '#92400e', lineHeight: 1.45 }}>
              No caretaker form is available for your account. Ask an administrator to assign the Caretaker role and form access.
            </p>
          ) : null}
        </SignedIn>
      </div>
    </div>
  )
}
