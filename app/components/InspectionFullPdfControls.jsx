'use client'

import { useState } from 'react'
import { getInspectionFullReportPdfUrl } from '@/lib/inspection-pdf-fields'

/**
 * Always offer regenerate for full inspection reports unless explicitly disabled.
 * Needed after PDF layout/photo fixes so older saved Blob URLs can be rebuilt.
 */
export function shouldShowPdfRegenerate(_inspection, explicitShow) {
  if (explicitShow === false) return false
  return true
}

/**
 * Full inspection report PDF: POST to generate/upload then open.
 *
 * View/Download always rebuild with ?regenerate=1 so a stale Blob URL is never
 * treated as the "current" report after layout/content fixes. Cached full_pdf_url
 * alone is not sufficient for View/Download.
 *
 * Pass `savedPdfUrl` and/or `inspection` (row with nullable full_pdf_url / pdf_url / camelCase).
 * Optional Regenerate button force-rebuilds and opens (same rebuild path).
 * Shown for all full reports unless `showRegenerate={false}`.
 */
export default function InspectionFullPdfControls({
  inspectionId,
  savedPdfUrl,
  inspection,
  pdfGenerationError,
  onAfterGenerate,
  variant = 'links',
  linkStyle = {},
  forceRegenerate = false,
  showRegenerate,
}) {
  const [busy, setBusy] = useState(false)
  const [regenBusy, setRegenBusy] = useState(false)
  const [regeneratedUrl, setRegeneratedUrl] = useState('')
  const [regenerateStatus, setRegenerateStatus] = useState(null)
  const fromProp =
    savedPdfUrl != null && String(savedPdfUrl).trim() !== '' ? String(savedPdfUrl).trim() : null
  const fromRow = inspection ? getInspectionFullReportPdfUrl(inspection) : null
  const url = regeneratedUrl || fromProp || fromRow || ''
  const allowRegenerate = shouldShowPdfRegenerate(inspection, showRegenerate)
  const openInBrowser = (href, download) => {
    const a = document.createElement('a')
    a.href = href
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    if (download) a.download = `inspection-${inspectionId}.pdf`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const requestPdf = async ({ regenerate = true } = {}) => {
    // Always rebuild by default — never serve a stale saved Blob as "current".
    const qs = regenerate || forceRegenerate ? '?regenerate=1' : ''
    const res = await fetch(`/api/inspections/${inspectionId}/report-pdf${qs}`, {
      method: 'POST',
      credentials: 'include',
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(data.details || data.error || `PDF request failed (${res.status})`)
    }
    const next = String(data.url || '').trim()
    if (!next) throw new Error('No PDF URL returned')
    setRegeneratedUrl(next)
    if (onAfterGenerate) {
      try {
        await onAfterGenerate()
      } catch {
        // non-fatal
      }
    }
    return next
  }

  const ensureFreshPdfUrl = async () => {
    setBusy(true)
    try {
      return await requestPdf({ regenerate: true })
    } finally {
      setBusy(false)
    }
  }

  const handleView = async (e) => {
    e.preventDefault()
    try {
      const href = await ensureFreshPdfUrl()
      openInBrowser(href, false)
    } catch (err) {
      window.alert(err?.message || 'Could not open the inspection PDF.')
    }
  }

  const handleDownload = async (e) => {
    e.preventDefault()
    try {
      const href = await ensureFreshPdfUrl()
      openInBrowser(href, true)
    } catch (err) {
      window.alert(err?.message || 'Could not download the inspection PDF.')
    }
  }

  const handleRegenerate = async (e) => {
    e.preventDefault()
    setRegenBusy(true)
    setRegenerateStatus(null)
    try {
      const href = await requestPdf({ regenerate: true })
      setRegenerateStatus({ ok: true, message: 'Report regenerated. The new PDF is ready.' })
      openInBrowser(href, false)
    } catch (err) {
      setRegenerateStatus({
        ok: false,
        message: err?.message || 'Could not regenerate the inspection PDF.',
      })
    } finally {
      setRegenBusy(false)
    }
  }

  const baseLink =
    variant === 'icons'
      ? {
          color: linkStyle.color || '#0ea5e9',
          textDecoration: 'none',
          fontSize: linkStyle.fontSize || '1.25rem',
          cursor: busy || regenBusy ? 'wait' : 'pointer',
          opacity: busy || regenBusy ? 0.6 : 1,
        }
      : {
          color: linkStyle.color || '#0f766e',
          textDecoration: 'none',
          fontWeight: 500,
          fontSize: linkStyle.fontSize || '0.8125rem',
          cursor: busy || regenBusy ? 'wait' : 'pointer',
          opacity: busy || regenBusy ? 0.6 : 1,
        }

  const regenButtonStyle =
    variant === 'icons'
      ? {
          ...baseLink,
          background: 'none',
          border: 'none',
          padding: 0,
          fontSize: '0.75rem',
          fontWeight: 600,
        }
      : {
          ...baseLink,
          background: 'none',
          border: '1px solid #0f766e',
          borderRadius: 4,
          padding: '0.2rem 0.45rem',
          fontSize: '0.75rem',
          fontWeight: 600,
        }

  const errTitle =
    pdfGenerationError != null && String(pdfGenerationError).trim() !== ''
      ? String(pdfGenerationError)
      : ''

  const regenerateControl =
    allowRegenerate && !forceRegenerate ? (
      <>
        <button
          type="button"
          title="Force-rebuild the PDF with the latest layout and open it"
          onClick={handleRegenerate}
          disabled={busy || regenBusy}
          style={regenButtonStyle}
        >
          {regenBusy ? 'Regenerating…' : variant === 'icons' ? '↻' : 'Regenerate PDF'}
        </button>
        {regenerateStatus ? (
          <span
            role="status"
            aria-live="polite"
            title={regenerateStatus.message}
            style={{
              color: regenerateStatus.ok ? '#166534' : '#b91c1c',
              fontSize: '0.75rem',
            }}
          >
            {variant === 'icons'
              ? regenerateStatus.ok
                ? '✓'
                : '✕'
              : regenerateStatus.message}
          </span>
        ) : null}
      </>
    ) : null

  // Always use buttons that rebuild — never raw <a href={savedBlob}> (stale cache).
  if (variant === 'icons') {
    return (
      <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', justifyContent: 'center' }}>
        {errTitle ? (
          <span title={errTitle} style={{ color: '#d97706', fontSize: '1.1rem', cursor: 'help' }}>
            ⚠️
          </span>
        ) : null}
        <button
          type="button"
          title={url ? 'Rebuild and open full inspection PDF' : 'Generate and open full inspection PDF'}
          onClick={handleView}
          disabled={busy || regenBusy}
          style={{
            ...baseLink,
            background: 'none',
            border: 'none',
            padding: 0,
            fontSize: '1.25rem',
          }}
        >
          {busy ? '…' : '👁️'}
        </button>
        <button
          type="button"
          title={url ? 'Rebuild and download full inspection PDF' : 'Generate and download full inspection PDF'}
          onClick={handleDownload}
          disabled={busy || regenBusy}
          style={{
            ...baseLink,
            background: 'none',
            border: 'none',
            padding: 0,
            fontSize: '0.8125rem',
            fontWeight: 600,
          }}
        >
          {busy ? '…' : '⬇'}
        </button>
        {regenerateControl}
      </span>
    )
  }

  return (
    <span style={{ display: 'inline-flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
      {errTitle ? (
        <span title={errTitle} style={{ color: '#d97706', fontSize: '0.8125rem', cursor: 'help' }}>
          PDF issue
        </span>
      ) : null}
      <button
        type="button"
        onClick={handleView}
        disabled={busy || regenBusy}
        style={{ ...baseLink, background: 'none', border: 'none', padding: 0 }}
        title="Rebuild the PDF with the latest layout and open it"
      >
        {busy ? 'Generating…' : 'View PDF'}
      </button>
      <button
        type="button"
        onClick={handleDownload}
        disabled={busy || regenBusy}
        style={{ ...baseLink, background: 'none', border: 'none', padding: 0 }}
        title="Rebuild the PDF with the latest layout and download it"
      >
        {busy ? '…' : 'Download PDF'}
      </button>
      {regenerateControl}
    </span>
  )
}
