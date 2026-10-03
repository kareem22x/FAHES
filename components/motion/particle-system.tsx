'use client'

import { motion, useMotionValue, useTransform, useSpring } from 'motion/react'
import { useEffect, useRef, useState } from 'react'

interface Particle {
  id: number
  x: number
  y: number
  size: number
  speedX: number
  speedY: number
  opacity: number
}

/**
 * Interactive Particle System with physics-based motion
 * Particles react to mouse position with spring physics
 */
export default function ParticleSystem({
  count = 50,
  className = '',
  color = 'rgba(37, 99, 235, 0.6)',
}: {
  count?: number
  className?: string
  color?: string
}) {
  const [particles, setParticles] = useState<Particle[]>([])
  const containerRef = useRef<HTMLDivElement>(null)
  
  const mouseX = useMotionValue(0)
  const mouseY = useMotionValue(0)

  useEffect(() => {
    const newParticles: Particle[] = []
    for (let i = 0; i < count; i++) {
      newParticles.push({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: Math.random() * 4 + 2,
        speedX: (Math.random() - 0.5) * 0.3,
        speedY: (Math.random() - 0.5) * 0.3,
        opacity: Math.random() * 0.5 + 0.2,
      })
    }
    setParticles(newParticles)
  }, [count])

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    mouseX.set((e.clientX - rect.left) / rect.width)
    mouseY.set((e.clientY - rect.top) / rect.height)
  }

  return (
    <div
      ref={containerRef}
      className={`particle-system ${className}`}
      onMouseMove={handleMouseMove}
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      {particles.map((particle) => (
        <Particle
          key={particle.id}
          particle={particle}
          mouseX={mouseX}
          mouseY={mouseY}
          color={color}
        />
      ))}
    </div>
  )
}

function Particle({
  particle,
  mouseX,
  mouseY,
  color,
}: {
  particle: Particle
  mouseX: any
  mouseY: any
  color: string
}) {
  const x = useMotionValue(particle.x)
  const y = useMotionValue(particle.y)

  // Calculate distance from mouse for interaction. The callback parameter is
  // typed explicitly: `useTransform` cannot infer it from a MotionValue typed
  // as `any`, and the inferred `unknown` breaks arithmetic.
  const distanceX = useTransform(mouseX, (m: number) => m * 100 - particle.x)
  const distanceY = useTransform(mouseY, (m: number) => m * 100 - particle.y)
  
  // Spring physics for smooth repulsion
  const repelX = useSpring(
    useTransform(distanceX, (d) => -Math.sign(d) * Math.min(Math.abs(d) * 0.5, 20)),
    { stiffness: 100, damping: 20 }
  )
  
  const repelY = useSpring(
    useTransform(distanceY, (d) => -Math.sign(d) * Math.min(Math.abs(d) * 0.5, 20)),
    { stiffness: 100, damping: 20 }
  )

  return (
    <motion.div
      style={{
        position: 'absolute',
        left: `${particle.x}%`,
        top: `${particle.y}%`,
        width: particle.size,
        height: particle.size,
        borderRadius: '50%',
        backgroundColor: color,
        opacity: particle.opacity,
        x: repelX,
        y: repelY,
      }}
      animate={{
        x: [0, particle.speedX * 100, 0],
        y: [0, particle.speedY * 100, 0],
      }}
      transition={{
        duration: 10 + Math.random() * 10,
        repeat: Infinity,
        ease: 'linear',
      }}
    />
  )
}

/**
 * Floating particles with upward motion
 */
export function FloatingParticles({
  count = 20,
  className = '',
}: {
  count?: number
  className?: string
}) {
  const particles = Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    size: Math.random() * 6 + 3,
    delay: Math.random() * 5,
    duration: 8 + Math.random() * 7,
  }))

  return (
    <div className={`floating-particles ${className}`} style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {particles.map((particle) => (
        <motion.div
          key={particle.id}
          style={{
            position: 'absolute',
            left: `${particle.x}%`,
            bottom: '-10%',
            width: particle.size,
            height: particle.size,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(147, 197, 253, 0.8), rgba(59, 130, 246, 0.4))',
          }}
          animate={{
            y: ['-10%', '110%'],
            opacity: [0, 1, 1, 0],
            scale: [0, 1, 1, 0.5],
          }}
          transition={{
            duration: particle.duration,
            delay: particle.delay,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  )
}
