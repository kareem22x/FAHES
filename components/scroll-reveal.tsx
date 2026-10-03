'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

const REVEAL_SELECTOR = '.reveal, .stagger-on-view'

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

    if (typeof IntersectionObserver === 'undefined') {
      document.documentElement.classList.remove('js')
      return
    }

    const observed = new Set<Element>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          entry.target.classList.add('is-visible')
          observer.unobserve(entry.target)
          observed.delete(entry.target)
        }
      },
      // Matches the trigger geometry in `public/css-system/animations.js` so the
      // two reveal systems move in step: begin while the element is still just
      // below the fold (positive bottom margin), and fire on the first
      // intersecting pixel rather than waiting for a fraction of it. A positive
      // threshold makes short elements sit at the fold doing nothing.
      { rootMargin: '0px 0px 8% 0px', threshold: 0 },
    )

    const observeWithin = (root: Element | Document) => {
      const targets: Element[] = []
      if (root instanceof Element && root.matches(REVEAL_SELECTOR)) targets.push(root)
      targets.push(...root.querySelectorAll(REVEAL_SELECTOR))
      for (const target of targets) {
        if (observed.has(target) || target.classList.contains('is-visible')) continue
        observed.add(target)
        observer.observe(target)
      }
    }

    observeWithin(document)

    // The App Router mounts the incoming page *after* this effect fires —
    // `AnimatePresence` in PageTransition holds the outgoing tree for its exit
    // first — so a one-shot query would miss every reveal on the next page and
    // leave it stuck at opacity 0. Watching the DOM catches freshly mounted
    // subtrees (client-rendered lists too) no matter when they arrive.
    const mutations = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) observeWithin(node as Element)
        }
      }
    })
    mutations.observe(document.body, { childList: true, subtree: true })

    return () => {
      mutations.disconnect()
      observer.disconnect()
      observed.clear()
    }
  }, [pathname])

  useEffect(() => {
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
