'use client'

import { MotionConfig } from 'motion/react'
import type { ReactNode } from 'react'

/**
 * Makes every `motion` (Framer) animation run at full strength for all
 * visitors: `reducedMotion="never"` means the operating system's
 * "reduce motion" preference is ignored rather than obeyed.
 *
 * This matches the decision taken on the CSS side — the
 * `@media (prefers-reduced-motion: reduce)` block in `app/globals.css` is
 * commented out — and the carousel guard in `components/cities-section.tsx`.
 * All three must stay in agreement: if you restore one, restore all three, or
 * the site will be inconsistent (CSS animates while Framer stays still, etc.).
 *
 * Use `"user"` instead if you decide to honour the OS preference again.
 */
export default function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="never">{children}</MotionConfig>
}
