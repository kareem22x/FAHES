'use client'

import { AnimatePresence, motion } from 'motion/react'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import BrandMark from '@/components/brand-mark'
import { EASE_OUT_EXPO, pageVariants } from '@/components/motion/motion-presets'
import { NAVIGATION_START_EVENT } from '@/lib/navigation'

const MINIMUM_LOADER_DURATION = 420
const MAXIMUM_LOADER_DURATION = 3_000

type NetworkInformation = {
  effectiveType?: string
  rtt?: number
  saveData?: boolean
}

function loaderDelayForConnection() {
  const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection
  if (connection?.saveData || connection?.effectiveType === 'slow-2g' || connection?.effectiveType === '2g' || (connection?.rtt ?? 0) > 500) {
    return 0
  }
  if (connection?.effectiveType === '3g' || (connection?.rtt ?? 0) > 200) return 60
  return 140
}

function isRouteChange(href: string, currentPath: string) {
  try {
    const destination = new URL(href, window.location.href)
    return destination.origin === window.location.origin && destination.pathname !== currentPath
  } catch {
    return false
  }
}

/**
 * Handles internal links and browser history without showing a loader on the
 * initial render, external links, same-page anchors, or modified clicks.
 */
export default function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '/'
  const pathnameRef = useRef(pathname)
  const pendingRef = useRef(false)
  const startedAtRef = useRef(0)
  const visibleAtRef = useRef(0)
  const displayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [loading, setLoading] = useState(false)

  const clearTimers = useCallback(() => {
    if (displayTimerRef.current) clearTimeout(displayTimerRef.current)
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current)
    displayTimerRef.current = null
    hideTimerRef.current = null
    safetyTimerRef.current = null
  }, [])

  const hideLoader = useCallback(() => {
    clearTimers()
    pendingRef.current = false
    visibleAtRef.current = 0
    setLoading(false)
  }, [clearTimers])

  const finishNavigation = useCallback(() => {
    if (!pendingRef.current) return
    if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current)
    safetyTimerRef.current = null
    if (displayTimerRef.current) {
      clearTimeout(displayTimerRef.current)
      displayTimerRef.current = null
    }
    if (visibleAtRef.current === 0) {
      hideLoader()
      return
    }
    const elapsed = performance.now() - startedAtRef.current
    const remaining = Math.min(
      Math.max(0, MINIMUM_LOADER_DURATION - (performance.now() - visibleAtRef.current)),
      Math.max(0, MAXIMUM_LOADER_DURATION - elapsed),
    )
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    hideTimerRef.current = setTimeout(() => {
      hideLoader()
    }, remaining)
  }, [hideLoader])

  const startNavigation = useCallback(() => {
    if (pendingRef.current) return
    clearTimers()
    pendingRef.current = true
    startedAtRef.current = performance.now()
    displayTimerRef.current = setTimeout(() => {
      if (pendingRef.current) {
        visibleAtRef.current = performance.now()
        setLoading(true)
      }
      displayTimerRef.current = null
    }, loaderDelayForConnection())
    safetyTimerRef.current = setTimeout(hideLoader, MAXIMUM_LOADER_DURATION)
  }, [clearTimers, hideLoader])

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      if (!(event.target instanceof Element)) return

      const anchor = event.target.closest<HTMLAnchorElement>('a[href]')
      if (!anchor || anchor.hasAttribute('download') || anchor.getAttribute('aria-disabled') === 'true') return
      if (anchor.target && anchor.target !== '_self') return
      if (anchor.relList.contains('external')) return
      if (isRouteChange(anchor.href, pathnameRef.current)) startNavigation()
    }
    const handleHistory = () => {
      if (isRouteChange(window.location.href, pathnameRef.current)) startNavigation()
    }
    const handleProgrammaticNavigation = (event: Event) => {
      if (!(event instanceof CustomEvent) || typeof event.detail !== 'string') return
      if (isRouteChange(event.detail, pathnameRef.current)) startNavigation()
    }

    document.addEventListener('click', handleClick, true)
    window.addEventListener('popstate', handleHistory)
    window.addEventListener(NAVIGATION_START_EVENT, handleProgrammaticNavigation)
    return () => {
      document.removeEventListener('click', handleClick, true)
      window.removeEventListener('popstate', handleHistory)
      window.removeEventListener(NAVIGATION_START_EVENT, handleProgrammaticNavigation)
      clearTimers()
    }
  }, [clearTimers, startNavigation])

  useEffect(() => {
    if (pathnameRef.current === pathname) return
    pathnameRef.current = pathname
    finishNavigation()
  }, [finishNavigation, pathname])

  return (
    <>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={pathname}
          className="page-transition"
          variants={pageVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          {children}
        </motion.div>
      </AnimatePresence>

      <AnimatePresence>
        {loading && (
          <motion.div
            className="route-loader"
            role="status"
            aria-live="polite"
            aria-atomic="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: EASE_OUT_EXPO }}
          >
            <motion.div
              className="route-loader-card"
              initial={{ opacity: 0, y: 14, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 360, damping: 30 }}
            >
              <span className="route-loader-orbit route-loader-orbit-outer" aria-hidden="true" />
              <span className="route-loader-orbit route-loader-orbit-inner" aria-hidden="true" />
              <span className="route-loader-mark"><BrandMark priority /></span>
              <span className="route-loader-brand">فاحص</span>
              <span className="route-loader-message">جارٍ تحميل الصفحة</span>
              <span className="route-loader-progress" aria-hidden="true"><span /></span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
