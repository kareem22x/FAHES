'use client'

import { motion, useMotionValue, useTransform, useSpring } from 'motion/react'
import { useRef, useState, type ReactNode } from 'react'

/**
 * Advanced 3D Card with physics-based tilt and spring animations
 * Uses realistic spring physics for smooth, natural motion
 */
export default function Advanced3DCard({
  children,
  className = '',
  maxTilt = 15,
}: {
  children: ReactNode
  className?: string
  maxTilt?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [isHovered, setIsHovered] = useState(false)

  // Motion values for physics-based animation
  const x = useMotionValue(0)
  const y = useMotionValue(0)

  // Spring-configured transforms for realistic physics
  const rotateX = useSpring(useTransform(y, [-0.5, 0.5], [maxTilt, -maxTilt]), {
    stiffness: 300,
    damping: 30,
    mass: 0.8,
  })

  const rotateY = useSpring(useTransform(x, [-0.5, 0.5], [-maxTilt, maxTilt]), {
    stiffness: 300,
    damping: 30,
    mass: 0.8,
  })

  const scale = useSpring(isHovered ? 1.05 : 1, {
    stiffness: 400,
    damping: 25,
  })

  const glareOpacity = useSpring(isHovered ? 0.4 : 0, {
    stiffness: 200,
    damping: 30,
  })

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    
    x.set((e.clientX - centerX) / rect.width)
    y.set((e.clientY - centerY) / rect.height)
  }

  const handleMouseLeave = () => {
    setIsHovered(false)
    x.set(0)
    y.set(0)
  }

  return (
    <motion.div
      ref={ref}
      className={`advanced-3d-card ${className}`}
      style={{
        rotateX,
        rotateY,
        scale,
        transformStyle: 'preserve-3d',
      }}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={handleMouseLeave}
      whileHover={{ cursor: 'pointer' }}
    >
      {/* Glare effect */}
      <motion.div
        className="absolute inset-0 pointer-events-none rounded-inherit"
        style={{
          background: 'linear-gradient(135deg, rgba(255,255,255,0.3) 0%, transparent 50%)',
          opacity: glareOpacity,
          mixBlendMode: 'overlay',
        }}
      />
      
      {/* Content with depth */}
      <motion.div
        style={{
          transform: 'translateZ(20px)',
        }}
      >
        {children}
      </motion.div>
    </motion.div>
  )
}
