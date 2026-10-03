'use client'

import { motion } from 'motion/react'
import { Check } from 'lucide-react'

export default function SuccessAnimation({ className = '' }: { className?: string }) {
  return (
    <motion.span
      className={className}
      initial={{ scale: 0.7, rotate: -12, opacity: 0 }}
      animate={{ scale: 1, rotate: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 360, damping: 22 }}
    >
      <Check size={34} strokeWidth={3} />
    </motion.span>
  )
}
