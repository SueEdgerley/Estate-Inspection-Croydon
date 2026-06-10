'use client'

import { useEffect, useRef } from 'react'

/**
 * "Resume saved inspection?" prompt shown when a saved draft is found on mount.
 *
 * - Resume: restores the saved form state.
 * - Discard: deletes the draft and starts fresh.
 * - Escape / overlay click: closes the prompt but keeps the draft.
 */
export default function ResumeInspectionDraftModal({
  inspectionType,
  locationLabel,
  savedAtLabel,
  onResume,
  onDiscard,
  onClose,
}) {
  const dialogRef = useRef(null)
  const resumeButtonRef = useRef(null)

  useEffect(() => {
    const previouslyFocused = document.activeElement
    resumeButtonRef.current?.focus()

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      // Keep focus inside the dialog while it is open.
      const focusable = dialogRef.current?.querySelectorAll('button:not([disabled])')
      if (!focusable || focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown, true)
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus()
      }
    }
  }, [onClose])

  return (
    <div
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        background: 'rgba(15, 23, 42, 0.45)',
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="resume-inspection-draft-title"
        aria-describedby="resume-inspection-draft-details"
        style={{
          width: '100%',
          maxWidth: 420,
          backgroundColor: 'white',
          borderRadius: '0.5rem',
          boxShadow: '0 20px 45px rgba(15, 23, 42, 0.25)',
          padding: '1.5rem',
          boxSizing: 'border-box',
        }}
      >
        <h2
          id="resume-inspection-draft-title"
          style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700, color: '#111827' }}
        >
          Resume saved inspection?
        </h2>
        <div
          id="resume-inspection-draft-details"
          style={{ margin: '0.75rem 0 0', fontSize: '0.9375rem', color: '#374151', lineHeight: 1.5 }}
        >
          {inspectionType ? (
            <p style={{ margin: 0, fontWeight: 600, color: '#111827' }}>{inspectionType}</p>
          ) : null}
          {locationLabel ? (
            <p style={{ margin: '0.25rem 0 0' }}>Location: {locationLabel}</p>
          ) : null}
          {savedAtLabel ? (
            <p style={{ margin: '0.25rem 0 0', color: '#6b7280', fontSize: '0.875rem' }}>
              Last saved: {savedAtLabel}
            </p>
          ) : null}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '1.25rem' }}>
          <button
            ref={resumeButtonRef}
            type="button"
            onClick={onResume}
            style={{
              padding: '0.6rem 1.1rem',
              border: 'none',
              borderRadius: '0.375rem',
              background: '#1d4ed8',
              color: 'white',
              fontSize: '0.9375rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Resume
          </button>
          <button
            type="button"
            onClick={onDiscard}
            style={{
              padding: '0.6rem 1.1rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              background: 'white',
              color: '#374151',
              fontSize: '0.9375rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Discard
          </button>
        </div>
      </div>
    </div>
  )
}
