'use client'

import { useState } from 'react'

export default function BestPracticeGuideButton({
  title = 'Best Practice Guide',
  content = null,
  templateId = '',
  templateKey = '',
  templateName = '',
  guideUrl = '/guides/best-practice-guide.pdf',
  openInNewTab = true,
}) {
  const [open, setOpen] = useState(false)
  const [guide, setGuide] = useState(guideUrl ? { title, file_url: guideUrl } : null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function openGuide() {
    setError('')
    const currentUrl = guide?.file_url || guideUrl
    if (currentUrl && openInNewTab) {
      window.open(currentUrl, '_blank', 'noopener,noreferrer')
      return
    }
    if (!currentUrl && (templateId || templateKey || templateName)) {
      setLoading(true)
      try {
        const params = new URLSearchParams()
        if (templateId) params.set('template_id', templateId)
        if (templateKey) params.set('template_key', templateKey)
        if (templateName) params.set('template_name', templateName)
        const res = await fetch(`/api/best-practice-guides?${params.toString()}`, {
          credentials: 'include',
          cache: 'no-store',
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || 'Guide lookup failed')
        if (data?.guide) {
          setGuide(data.guide)
          if (openInNewTab) {
            window.open(data.guide.file_url, '_blank', 'noopener,noreferrer')
            return
          }
        }
      } catch (e) {
        setError(e?.message || 'Guide unavailable')
      } finally {
        setLoading(false)
      }
    }
    setOpen(true)
  }

  return (
    <>
      <button
        type="button"
        onClick={openGuide}
        aria-label="Open best practice guide"
        style={{
          position: 'fixed',
          right: 16,
          bottom: 16,
          zIndex: 80,
          minHeight: 48,
          padding: '0.75rem 1rem',
          borderRadius: 999,
          border: '1px solid #1d4ed8',
          background: '#1d4ed8',
          color: '#fff',
          fontWeight: 700,
          boxShadow: '0 10px 24px rgba(15, 23, 42, 0.22)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          touchAction: 'manipulation',
        }}
      >
        <span aria-hidden="true">📘</span>
        <span>Guide</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="best-practice-guide-title"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 90,
            background: 'rgba(15, 23, 42, 0.36)',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
          onClick={() => setOpen(false)}
        >
          <aside
            onClick={(event) => event.stopPropagation()}
            style={{
              width: 'min(420px, 92vw)',
              height: '100%',
              background: '#fff',
              boxShadow: '-12px 0 28px rgba(15, 23, 42, 0.24)',
              padding: '1.25rem',
              overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <p style={{ margin: '0 0 0.25rem', fontSize: '0.8rem', color: '#64748b', fontWeight: 700 }}>
                  Best Practice
                </p>
                <h2 id="best-practice-guide-title" style={{ margin: 0, fontSize: '1.25rem', color: '#0f172a' }}>
                  {title}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close best practice guide"
                style={{
                  border: '1px solid #cbd5e1',
                  background: '#fff',
                  borderRadius: 8,
                  padding: '0.35rem 0.6rem',
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
              >
                Close
              </button>
            </div>
            <div style={{ marginTop: '1.5rem', color: '#334155', lineHeight: 1.55 }}>
              {loading ? <p style={{ margin: 0 }}>Loading guide...</p> : null}
              {error ? <p style={{ margin: 0, color: '#b91c1c' }}>{error}</p> : null}
              {guide?.file_url ? (
                <div>
                  <p style={{ margin: '0 0 1rem' }}>
                    {guide.title || title}
                  </p>
                  <iframe
                    title={guide.title || title}
                    src={guide.file_url}
                    style={{
                      width: '100%',
                      height: '72vh',
                      border: '1px solid #cbd5e1',
                      borderRadius: 8,
                    }}
                  />
                  <p style={{ margin: '1rem 0 0' }}>
                    <a href={guide.file_url} target="_blank" rel="noopener noreferrer">
                      Open guide in a new tab
                    </a>
                  </p>
                </div>
              ) : content || <p style={{ margin: 0 }}>Best Practice Guide coming soon.</p>}
            </div>
          </aside>
        </div>
      )}
    </>
  )
}
