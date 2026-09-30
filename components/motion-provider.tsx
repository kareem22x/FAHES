'use client'

import { MotionConfig } from 'motion/react'
import type { ReactNode } from 'react'

/**
 * Makes every `motion` animation follow the operating system's reduced-motion
 * setting. Without this, motion logs a warning on load and keeps animating for
 * users who asked for less movement.
 */
export default function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>
}
