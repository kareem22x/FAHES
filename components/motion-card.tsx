'use client'

import { motion } from 'motion/react'
import type { ReactNode } from 'react'

/**
 * Hover/tap feedback for cards. Reduced-motion handling lives in
 * `MotionProvider` (`<MotionConfig reducedMotion="user">`), so no per-component
 * `useReducedMotion()` is needed here.
 */
export default function MotionCard({ children, className }: { children: ReactNode; className: string }) {
  return (
    <motion.article
      className={className}
      tabIndex={-1}
      whileHover={{ y: -4, scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      transition={{ type: 'spring', stiffness: 360, damping: 26 }}
    >
      {children}
    </motion.article>
  )
}
