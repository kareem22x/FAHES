'use client'

import { motion, useAnimation, useInView, type Variants } from 'motion/react'
import { useEffect, useRef, type ReactNode } from 'react'

/**
 * Kinetic Typography with staggered character animation
 * Each character animates independently with spring physics
 */
export default function KineticTypography({
  text,
  className = '',
  delay = 0,
  duration = 0.05,
}: {
  text: string
  className?: string
  delay?: number
  duration?: number
}) {
  const controls = useAnimation()
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-100px' })

  useEffect(() => {
    if (isInView) {
      controls.start('visible')
    }
  }, [isInView, controls])

  const letters = Array.from(text)

  const container = {
    hidden: { opacity: 0 },
    visible: (i = 1) => ({
      opacity: 1,
      transition: { staggerChildren: duration, delayChildren: delay },
    }),
  }

  // Annotated as Variants so `transition.type` stays the literal 'spring'
  // rather than widening to `string`, which is not assignable.
  const child: Variants = {
    visible: {
      opacity: 1,
      y: 0,
      rotate: 0,
      scale: 1,
      transition: {
        type: 'spring',
        damping: 15,
        stiffness: 200,
      },
    },
    hidden: {
      opacity: 0,
      y: 50,
      rotate: 10,
      scale: 0.8,
      transition: {
        type: 'spring',
        damping: 20,
        stiffness: 300,
      },
    },
  }

  return (
    <motion.div
      ref={ref}
      className={`kinetic-typography ${className}`}
      variants={container}
      initial="hidden"
      animate={controls}
    >
      {letters.map((letter, index) => (
        <motion.span
          key={`${letter}-${index}`}
          variants={child}
          style={{ display: 'inline-block', whiteSpace: 'pre' }}
        >
          {letter === ' ' ? '\u00A0' : letter}
        </motion.span>
      ))}
    </motion.div>
  )
}

/**
 * Word-based kinetic typography for better readability
 */
export function KineticWords({
  text,
  className = '',
  delay = 0,
}: {
  text: string
  className?: string
  delay?: number
}) {
  const controls = useAnimation()
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-100px' })

  useEffect(() => {
    if (isInView) {
      controls.start('visible')
    }
  }, [isInView, controls])

  const words = text.split(' ')

  const container = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.08, delayChildren: delay },
    },
  }

  const child: Variants = {
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        type: 'spring',
        damping: 12,
        stiffness: 100,
      },
    },
    hidden: {
      opacity: 0,
      y: 30,
      transition: {
        type: 'spring',
        damping: 15,
        stiffness: 200,
      },
    },
  }

  return (
    <motion.div
      ref={ref}
      className={`kinetic-words ${className}`}
      variants={container}
      initial="hidden"
      animate={controls}
    >
      {words.map((word, index) => (
        <motion.span
          key={`${word}-${index}`}
          variants={child}
          style={{ display: 'inline-block', marginRight: '0.3em' }}
        >
          {word}
        </motion.span>
      ))}
    </motion.div>
  )
}
