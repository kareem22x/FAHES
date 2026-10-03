'use client'

import { useEffect, useRef, useState } from 'react'
import { useInView } from 'motion/react'

/**
 * Counts up to `to` the first time it scrolls into view.
 *
 * State is only ever written from inside the rAF callback, which keeps the
 * effect free of render cascades.
 */
export default function CountUp({
  to,
  suffix = '',
  duration = 1500,
}: {
  to: number
  suffix?: string
  duration?: number
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.4 })
  const [value, setValue] = useState(0)

  useEffect(() => {
    if (!inView) return

    let frame = 0
    const startedAt = performance.now()

    const tick = (now: number) => {
      const progress = duration <= 0
        ? 1
        : Math.min(1, (now - startedAt) / duration)
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Math.round(eased * to))
      if (progress < 1) frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [duration, inView, to])

  return (
    <span ref={ref}>
      {value}
      {suffix}
    </span>
  )
}
