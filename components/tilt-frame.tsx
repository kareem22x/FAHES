'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Pointer-driven 3D tilt for the hero illustration. Children wrapped in
 * `.tilt-layer` drift on their own depth, which reads as a soft parallax.
 *
 * Only active for fine pointers when the visitor has not asked for reduced
 * motion, so touch devices and reduced-motion users get a static card.
 */
export default function TiltFrame({
  children,
  className,
  max = 6,
}: {
  children: ReactNode
  className?: string
  max?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const pointer = window.matchMedia('(hover: hover) and (pointer: fine)')
    const sync = () => setEnabled(!motion.matches && pointer.matches)
    sync()
    motion.addEventListener('change', sync)
    pointer.addEventListener('change', sync)
    return () => {
      motion.removeEventListener('change', sync)
      pointer.removeEventListener('change', sync)
    }
  }, [])

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!enabled) return
      const element = ref.current
      if (!element) return
      const rect = element.getBoundingClientRect()
      const x = (event.clientX - rect.left) / rect.width - 0.5
      const y = (event.clientY - rect.top) / rect.height - 0.5
      element.style.setProperty('--tilt-x', `${(-y * max).toFixed(2)}deg`)
      element.style.setProperty('--tilt-y', `${(x * max).toFixed(2)}deg`)
      element.style.setProperty('--glow-x', `${((x + 0.5) * 100).toFixed(1)}%`)
      element.style.setProperty('--glow-y', `${((y + 0.5) * 100).toFixed(1)}%`)
      element.dataset.tracking = 'true'
    },
    [enabled, max],
  )

  const reset = useCallback(() => {
    const element = ref.current
    if (!element) return
    delete element.dataset.tracking
    element.style.setProperty('--tilt-x', '0deg')
    element.style.setProperty('--tilt-y', '0deg')
  }, [])

  return (
    <div ref={ref} className={`tilt-frame ${className ?? ''}`} onPointerMove={onPointerMove} onPointerLeave={reset}>
      {children}
    </div>
  )
}
