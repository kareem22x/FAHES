'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

/**
 * Progressive-enhancement scroll effects:
 *
 * - `.reveal` / `.stagger-on-view` fade and slide in the first time they enter
 *   the viewport (the `js` class arms the hidden state, so without JavaScript
 *   every element stays visible).
 * - `[data-parallax]` elements drift vertically as the page scrolls, using a
 *   single requestAnimationFrame loop (no React re-renders on scroll).
 */
export default function ScrollReveal() {
  const pathname = usePathname()

  useEffect(() => {
    document.documentElement.classList.add('js')

    const targets = document.querySelectorAll<HTMLElement>('.reveal:not(.is-visible), .stagger-on-view:not(.is-visible)')
    let observer: IntersectionObserver | undefined

    if (typeof IntersectionObserver === 'undefined') {
      targets.forEach((element) => element.classList.add('is-visible'))
    } else if (targets.length > 0) {
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue
            entry.target.classList.add('is-visible')
            observer?.unobserve(entry.target)
          }
        },
        { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
      )
      targets.forEach((element) => observer.observe(element))
    }

    return () => observer?.disconnect()
  }, [pathname])

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (reduced.matches) return

    const elements = document.querySelectorAll<HTMLElement>('[data-parallax]')
    if (elements.length === 0) return

    let frame = 0
    const update = () => {
      frame = 0
      const viewport = window.innerHeight
      for (const element of elements) {
        const speed = parseFloat(element.dataset.parallax ?? '20') || 0
        const rect = element.getBoundingClientRect()
        // -1 at the top of the viewport, +1 at the bottom; centre = 0.
        const offset = (rect.top + rect.height / 2 - viewport / 2) / (viewport / 2 + rect.height / 2)
        element.style.setProperty('--parallax-y', `${(-offset * speed).toFixed(1)}px`)
      }
    }
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(update)
    }

    update()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      if (frame !== 0) cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
    }
  }, [pathname])

  return null
}
