import { cn } from '@/lib/utils'
import type { Tone } from '@/lib/admin/labels'

/**
 * Light-themed surface primitives for the admin console.
 *
 * Mirrors the inspector dashboard palette: white panels on #f6f9ff ground,
 * #e3eaf2 hairlines, #102444 ink. Kept free of hooks so they render inside
 * server components.
 */

export function GlassPanel({
  className,
  children,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'rounded-[9px] border border-[#e3eaf2] bg-white shadow-[0_1px_0_0_rgba(255,255,255,0.5)_inset]',
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
          <h2 className="text-sm font-medium text-[#102444]">{title}</h2>
          {hint}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </GlassPanel>
  )
}

const toneStyles: Record<Tone, string> = {
  good: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  warn: 'bg-amber-50 text-amber-700 ring-amber-200',
  bad: 'bg-rose-50 text-rose-700 ring-rose-200',
  neutral: 'bg-slate-100 text-slate-600 ring-slate-200',
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
      {...{ children }}
    >
      {children}
    </span>
  )
}

/** Small dot used for live/system status indicators. */
export function StatusDot({ tone = 'good', pulse = false }: { tone?: Tone; pulse?: boolean }) {
  const color =
    tone === 'good' ? 'bg-emerald-500' : tone === 'warn' ? 'bg-amber-500' : tone === 'bad' ? 'bg-rose-500' : 'bg-slate-400'
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
    ghost: 'border-[#e3eaf2] bg-white text-[#475d78] hover:bg-slate-50 hover:text-[#102444]',
    solid: 'border-transparent bg-[#0b1f46] text-white hover:bg-[#1a3563]',
    danger: 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
    warn: 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100',
  } as const
  return (
    <button
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border font-medium transition-colors outline-none',
        'focus-visible:ring-2 focus-visible:ring-sky-400/60 disabled:pointer-events-none disabled:opacity-50',
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
    <div className="rounded-xl border border-dashed border-[#e3eaf2] bg-slate-50/50 px-5 py-10 text-center text-xs text-[#65768d]">
      {children}
    </div>
  )
}

const noticeStyles: Record<Tone, string> = {
  good: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  warn: 'border-amber-200 bg-amber-50 text-amber-800',
  bad: 'border-rose-200 bg-rose-50 text-rose-800',
  neutral: 'border-[#e3eaf2] bg-slate-50 text-[#102444]',
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
