'use client'

import { useEffect } from 'react'

/**
 * Registers the minimal service worker in production for PWA install prompts.
 */
export default function PwaRegister() {
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

  return null
}
