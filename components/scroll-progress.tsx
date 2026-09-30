'use client'

import { useEffect, useRef } from 'react'

/**
 * Hairline progress bar pinned to the top of the page. Updates through
 * requestAnimationFrame so scrolling never triggers a React re-render.
 */
export default function ScrollProgress() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let frame = 0

    const update = () => {
      frame = 0
      const doc = document.documentElement
      const max = doc.scrollHeight - doc.clientHeight
      const progress = max > 0 ? Math.min(1, Math.max(0, doc.scrollTop / max)) : 0
      ref.current?.style.setProperty('--progress', progress.toFixed(4))
    }

    const onScroll = () => {
      if (frame === 0) frame = requestAnimationFrame(update)
    }

    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      if (frame !== 0) cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  return <div className="scroll-progress" ref={ref} aria-hidden="true" />
}
