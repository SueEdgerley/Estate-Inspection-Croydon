'use client'

import { useEffect, useState } from 'react'

const INSTALL_PROMPT_DISMISSED_KEY = 'estate-inspection-pwa-install-dismissed'

function isStandaloneDisplay() {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
}

function isIosDevice() {
  if (typeof window === 'undefined') return false
  const ua = window.navigator.userAgent || ''
  const platform = window.navigator.platform || ''
  return /iPad|iPhone|iPod/.test(ua) || (platform === 'MacIntel' && window.navigator.maxTouchPoints > 1)
}

/**
 * Registers the minimal service worker and surfaces browser-specific install help.
 */
export default function PwaRegister() {
  const [installPromptEvent, setInstallPromptEvent] = useState(null)
  const [showIosHelp, setShowIosHelp] = useState(false)
  const [isDismissed, setIsDismissed] = useState(true)

  useEffect(() => {
    if (typeof window === 'undefined') return
    setIsDismissed(window.localStorage.getItem(INSTALL_PROMPT_DISMISSED_KEY) === 'true')
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (process.env.NODE_ENV !== 'production') return
    if (!('serviceWorker' in navigator)) return

    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .catch(() => {
        /* non-fatal */
      })
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (isStandaloneDisplay()) return

    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault()
      setInstallPromptEvent(event)
      setShowIosHelp(false)
    }

    const handleAppInstalled = () => {
      setInstallPromptEvent(null)
      setShowIosHelp(false)
      window.localStorage.setItem(INSTALL_PROMPT_DISMISSED_KEY, 'true')
      setIsDismissed(true)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    if (isIosDevice()) {
      setShowIosHelp(true)
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  const dismissPrompt = () => {
    window.localStorage.setItem(INSTALL_PROMPT_DISMISSED_KEY, 'true')
    setIsDismissed(true)
  }

  const handleInstallClick = async () => {
    if (!installPromptEvent) return
    installPromptEvent.prompt()
    await installPromptEvent.userChoice.catch(() => null)
    setInstallPromptEvent(null)
  }

  if (isDismissed || isStandaloneDisplay() || (!installPromptEvent && !showIosHelp)) {
    return null
  }

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        left: '1rem',
        right: '1rem',
        bottom: '1rem',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '0.75rem',
        maxWidth: 560,
        margin: '0 auto',
        padding: '0.85rem 1rem',
        borderRadius: '0.75rem',
        border: '1px solid #c7d2fe',
        background: '#ffffff',
        color: '#1f2937',
        boxShadow: '0 12px 30px rgba(31, 41, 55, 0.18)',
      }}
    >
      <div style={{ fontSize: '0.875rem', lineHeight: 1.35 }}>
        <strong style={{ display: 'block', color: '#1E3A8A' }}>Install Estate Inspection</strong>
        {installPromptEvent ? (
          <span>Save this app to your home screen for quicker access.</span>
        ) : (
          <span>On iPhone or iPad, tap Share, then Add to Home Screen.</span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
        {installPromptEvent ? (
          <button
            type="button"
            onClick={handleInstallClick}
            style={{
              padding: '0.5rem 0.8rem',
              border: 'none',
              borderRadius: '0.5rem',
              background: '#1E3A8A',
              color: '#fff',
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            Install
          </button>
        ) : null}
        <button
          type="button"
          onClick={dismissPrompt}
          aria-label="Dismiss install prompt"
          style={{
            padding: '0.45rem 0.55rem',
            border: '1px solid #d1d5db',
            borderRadius: '0.5rem',
            background: '#fff',
            color: '#4b5563',
            cursor: 'pointer',
            fontWeight: 700,
          }}
        >
          Not now
        </button>
      </div>
    </div>
  )
}
