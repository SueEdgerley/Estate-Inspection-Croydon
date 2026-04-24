'use client'

import { useState } from 'react'
import { getInspectionFullReportPdfUrl } from '@/lib/inspection-pdf-fields'

/**
 * Full inspection report PDF: open saved Blob URL, or POST to generate/upload then open.
 * Pass `savedPdfUrl` and/or `inspection` (row with nullable full_pdf_url / pdf_url / camelCase).
 */
export default function InspectionFullPdfControls({
  inspectionId,
  savedPdfUrl,
  inspection,
  pdfGenerationError,
  onAfterGenerate,
  variant = 'links',
  linkStyle = {},
}) {
  const [busy, setBusy] = useState(false)
  const fromProp =
    savedPdfUrl != null && String(savedPdfUrl).trim() !== '' ? String(savedPdfUrl).trim() : null
  const fromRow = inspection ? getInspectionFullReportPdfUrl(inspection) : null
  const url = fromProp ?? fromRow ?? ''

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

  const ensurePdfUrl = async () => {
    if (url) return url
    setBusy(true)
    try {
      const res = await fetch(`/api/inspections/${inspectionId}/report-pdf`, {
        method: 'POST',
        credentials: 'include',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.details || data.error || `PDF request failed (${res.status})`)
      }
      const next = String(data.url || '').trim()
      if (!next) throw new Error('No PDF URL returned')
      if (onAfterGenerate) {
        try {
          await onAfterGenerate()
        } catch {
          // non-fatal
        }
      }
      return next
    } finally {
      setBusy(false)
    }
  }

  const baseLink =
    variant === 'icons'
      ? {
          color: linkStyle.color || '#0ea5e9',
          textDecoration: 'none',
          fontSize: linkStyle.fontSize || '1.25rem',
          cursor: busy ? 'wait' : 'pointer',
          opacity: busy ? 0.6 : 1,
        }
      : {
          color: linkStyle.color || '#0f766e',
          textDecoration: 'none',
          fontWeight: 500,
          fontSize: linkStyle.fontSize || '0.8125rem',
          cursor: busy ? 'wait' : 'pointer',
          opacity: busy ? 0.6 : 1,
        }

  const handleView = async (e) => {
    e.preventDefault()
    try {
      const href = await ensurePdfUrl()
      openInBrowser(href, false)
    } catch (err) {
      window.alert(err?.message || 'Could not open the inspection PDF.')
    }
  }

  const handleDownload = async (e) => {
    e.preventDefault()
    try {
      const href = await ensurePdfUrl()
      openInBrowser(href, true)
    } catch (err) {
      window.alert(err?.message || 'Could not download the inspection PDF.')
    }
  }

  if (url) {
    if (variant === 'icons') {
      return (
        <span style={{ display: 'inline-flex', gap: 10, alignItems: 'center', justifyContent: 'center' }}>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            title="View saved full PDF"
            style={{ ...baseLink, fontSize: '1.25rem' }}
          >
            👁️
          </a>
          <a
            href={url}
            download={`inspection-${inspectionId}.pdf`}
            title="Download saved full PDF"
            style={{ ...baseLink, fontSize: '0.8125rem', fontWeight: 600 }}
          >
            ⬇
          </a>
        </span>
      )
    }
    return (
      <>
        <a href={url} target="_blank" rel="noopener noreferrer" style={baseLink}>
          View PDF
        </a>
        <a href={url} download={`inspection-${inspectionId}.pdf`} style={baseLink}>
          Download PDF
        </a>
      </>
    )
  }

  const errTitle =
    pdfGenerationError != null && String(pdfGenerationError).trim() !== ''
      ? String(pdfGenerationError)
      : ''

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
          title="Generate and open full inspection PDF"
          onClick={handleView}
          disabled={busy}
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
          title="Generate and download full inspection PDF"
          onClick={handleDownload}
          disabled={busy}
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
      <button type="button" onClick={handleView} disabled={busy} style={{ ...baseLink, background: 'none', border: 'none', padding: 0 }}>
        {busy ? 'Generating…' : 'Open PDF'}
      </button>
      <button type="button" onClick={handleDownload} disabled={busy} style={{ ...baseLink, background: 'none', border: 'none', padding: 0 }}>
        {busy ? '…' : 'Download PDF'}
      </button>
    </span>
  )
}
