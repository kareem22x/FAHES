import { cn } from '@/lib/utils'
import type { Tone } from '@/lib/admin/labels'

/**
 * Glassmorphic surface primitives for the admin console.
 *
 * Kept free of hooks so they render inside server components. The console is
 * deliberately dark while the public product is light — it is a separate
 * workspace, and the contrast makes it obvious at a glance which environment
 * you are operating in.
 */

export function GlassPanel({
  className,
  children,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-white/10 bg-neutral-950/80 shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] backdrop-blur-2xl',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export function GlassCard({
  title,
  hint,
  className,
  bodyClassName,
  children,
}: {
  title?: string
  hint?: React.ReactNode
  className?: string
  bodyClassName?: string
  children: React.ReactNode
}) {
  return (
    <GlassPanel className={cn('p-5', className)}>
      {title && (
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-neutral-100">{title}</h2>
          {hint}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </GlassPanel>
  )
}

const toneStyles: Record<Tone, string> = {
  good: 'bg-emerald-400/10 text-emerald-300 ring-emerald-400/20',
  warn: 'bg-amber-400/10 text-amber-300 ring-amber-400/20',
  bad: 'bg-rose-400/10 text-rose-300 ring-rose-400/20',
  neutral: 'bg-white/5 text-neutral-300 ring-white/10',
}

export function GlassBadge({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: Tone
  className?: string
  children: React.ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset whitespace-nowrap',
        toneStyles[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

/** Small dot used for live/system status indicators. */
export function StatusDot({ tone = 'good', pulse = false }: { tone?: Tone; pulse?: boolean }) {
  const color =
    tone === 'good' ? 'bg-emerald-400' : tone === 'warn' ? 'bg-amber-400' : tone === 'bad' ? 'bg-rose-400' : 'bg-neutral-500'
  return (
    <span className="relative inline-flex size-2 shrink-0">
      {pulse && <span className={cn('absolute inline-flex size-full animate-ping rounded-full opacity-60', color)} />}
      <span className={cn('relative inline-flex size-2 rounded-full', color)} />
    </span>
  )
}

export function GlassButton({
  variant = 'ghost',
  size = 'md',
  className,
  ...props
}: React.ComponentProps<'button'> & {
  variant?: 'ghost' | 'solid' | 'danger' | 'success' | 'warn'
  size?: 'sm' | 'md'
}) {
  const variants = {
    ghost: 'border-white/10 bg-white/5 text-neutral-200 hover:bg-white/10 hover:text-white',
    solid: 'border-transparent bg-white text-neutral-950 hover:bg-neutral-200',
    danger: 'border-rose-400/20 bg-rose-400/10 text-rose-300 hover:bg-rose-400/20',
    success: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300 hover:bg-emerald-400/20',
    warn: 'border-amber-400/20 bg-amber-400/10 text-amber-300 hover:bg-amber-400/20',
  } as const
  return (
    <button
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border font-medium transition-colors outline-none',
        'focus-visible:ring-2 focus-visible:ring-sky-400/60 disabled:pointer-events-none disabled:opacity-50',
        // Touch-target floor on phones (44px), compact from `sm` up. The
        // console is dense, so we grow the hit area only where a finger is
        // likely to be the pointer.
        'min-h-11 sm:min-h-0',
        size === 'sm' ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-xs',
        variants[variant],
        className,
      )}
      {...props}
    />
  )
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-white/10 bg-white/[.02] px-5 py-10 text-center text-xs text-neutral-500">
      {children}
    </div>
  )
}

const noticeStyles: Record<Tone, string> = {
  good: 'border-emerald-400/20 bg-emerald-400/[.07] text-emerald-200',
  warn: 'border-amber-400/20 bg-amber-400/[.07] text-amber-200',
  bad: 'border-rose-400/20 bg-rose-400/[.07] text-rose-200',
  neutral: 'border-white/10 bg-white/[.03] text-neutral-300',
}

/**
 * Operator-facing callout. Used to make degraded states explicit — a console
 * that quietly shows empty tables when a migration is missing is a console that
 * hides its own problems.
 */
export function Notice({
  tone = 'warn',
  title,
  children,
}: {
  tone?: Tone
  title: string
  children?: React.ReactNode
}) {
  return (
    <div className={cn('rounded-xl border px-4 py-3 text-xs leading-6', noticeStyles[tone])}>
      <p className="font-medium">{title}</p>
      {children ? <div className="mt-1 text-[11px] leading-6 opacity-90">{children}</div> : null}
    </div>
  )
}
