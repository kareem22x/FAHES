'use client'

import { useEffect } from 'react'

/**
 * Registers the service worker that makes the app installable.
 *
 * Registration waits for the `load` event on purpose. Registering during
 * hydration competes with the initial page's own requests for bandwidth, and on
 * a phone that is the difference between the marketing page painting quickly
 * and not. Nothing about the worker is needed until the *next* visit.
 *
 * Failures are swallowed deliberately: an unregistered worker costs the user
 * offline support, but a rejected promise surfacing as an unhandled rejection
 * would be noise in the console of an otherwise working app. Browsers without
 * service worker support (or in a private window on some platforms) simply skip
 * it — the app stays fully functional, just not installable.
 */
export function PwaRegister() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

    const register = () => {
      void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined)
    }

    if (document.readyState === 'complete') {
      register()
      return
    }
    window.addEventListener('load', register)
    return () => window.removeEventListener('load', register)
  }, [])

  return null
}

export default PwaRegister
