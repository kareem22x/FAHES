import type { Transition, Variants } from 'motion/react'

export const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const

export const springSoft: Transition = {
  type: 'spring',
  stiffness: 420,
  damping: 30,
}

export const tapPress = { scale: 0.97 }

export const pageVariants: Variants = {
  hidden: { opacity: 0, y: 10, scale: 0.994 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.32, ease: EASE_OUT_EXPO },
  },
  exit: {
    opacity: 0,
    y: -5,
    scale: 0.998,
    transition: { duration: 0.15, ease: EASE_OUT_EXPO },
  },
}
