import { cn } from '@/lib/utils'

/**
 * Fluid, auto-responsive page container.
 *
 * One component for every layout shell in the product (landing page, customer
 * dashboard, inspector workspace, admin console). It centres content, applies
 * fluid gutters that never fall below the touch-safe minimum, and caps the
 * measure so ultra-wide monitors do not stretch text lines to unreadable
 * lengths.
 *
 * Design notes
 * ------------
 * - Gutters come from `.rc-gutter` in `globals.css`, which uses `clamp()` with
 *   `env(safe-area-inset-*)` folded in. That keeps content clear of the notch
 *   and the home indicator on iOS without a second media query.
 * - Every value is a logical property (`padding-inline`, `margin-inline`), so
 *   RTL and LTR both work with no mirrored CSS.
 * - `bleed` is the escape hatch for full-width bands (hero art, city strip)
 *   that must still respect the safe area but ignore the max width.
 */

export type ContainerSize = 'narrow' | 'content' | 'wide' | 'full'

const sizes: Record<ContainerSize, string> = {
  // Long-form reading: help, terms, privacy.
  narrow: 'max-w-[720px]',
  // Default marketing + form pages.
  content: 'max-w-[1160px]',
  // Dashboards, tables, admin console.
  wide: 'max-w-[1600px]',
  // Edge-to-edge band (still padded, still safe-area aware).
  full: 'max-w-none',
}

export interface ResponsiveContainerProps extends React.HTMLAttributes<HTMLElement> {
  /** Rendered element. Defaults to `div`; use `section`/`main`/`header` as needed. */
  as?: 'div' | 'section' | 'main' | 'header' | 'footer' | 'article' | 'nav'
  /** Max width preset. Defaults to `content`. */
  size?: ContainerSize
  /** Remove the fluid gutter — for content that manages its own padding. */
  gutter?: boolean
  /** Opt out of centring (rare; used by full-bleed sticky bars). */
  centered?: boolean
}

export function ResponsiveContainer({
  as: Tag = 'div',
  size = 'content',
  gutter = true,
  centered = true,
  className,
  children,
  ...props
}: ResponsiveContainerProps) {
  return (
    <Tag
      className={cn(
        'rc-container',
        sizes[size],
        gutter && 'rc-gutter',
        centered && 'rc-centered',
        className,
      )}
      {...props}
    >
      {children}
    </Tag>
  )
}

/**
 * Auto-fitting grid used for card collections (KPI tiles, service cards,
 * inspection requests). Columns collapse on their own based on available
 * width, so a card never drops below `min` — no breakpoint ladder required.
 */
export function AutoGrid({
  min = 260,
  gap = 16,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { min?: number; gap?: number }) {
  return (
    <div
      className={cn('rc-auto-grid', className)}
      style={{ ['--rc-auto-min' as string]: `${min}px`, ['--rc-auto-gap' as string]: `${gap}px` }}
      {...props}
    >
      {children}
    </div>
  )
}

export default ResponsiveContainer
