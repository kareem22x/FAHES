'use client'

import { useEffect, useId, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronDown, LifeBuoy, Loader2, ShieldCheck, UserRound, Wrench } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SURFACE_HINT, SURFACE_LABEL, SURFACES, type Surface } from '@/lib/surfaces'

/**
 * The owner's surface switcher: stand in the client, inspector or support
 * surface, or step back into the admin console.
 *
 * ── Why a switcher and not three separate toggles ──────────────────────────
 *
 * The three surfaces are mutually exclusive — an owner is in exactly one of
 * them, or in none — so the control that moves between them has to show which
 * one is current. Three independent buttons would have to encode the same
 * state four ways (three surfaces plus "none") and could drift into showing
 * two as active. One list with one tick cannot.
 *
 * ── Why this is only a courtesy ────────────────────────────────────────────
 *
 * Hiding the switcher from a plain admin is not the security boundary. The
 * boundary is that `/api/auth/surface` re-derives ownership from the live Clerk
 * session and returns 403 to anyone else, and that `getSession()` refuses to
 * read the cookie for a non-owner at all. This component is rendered for
 * `tier === 'super_admin'` because a control that always fails is worse than no
 * control — not because hiding it protects anything.
 *
 * ── Why `refresh()` before `push()` ────────────────────────────────────────
 *
 * The destination layout re-resolves the session and reads the new cookie. The
 * router cache holds an RSC payload rendered under the *old* surface, so
 * pushing first would land on the previous surface's shell and only correct
 * itself on the next hard navigation.
 */

const SURFACE_ICON = {
  customer: UserRound,
  inspector: Wrench,
  support: LifeBuoy,
} as const

type Option = {
  value: Surface | null
  label: string
  hint: string
  Icon: typeof ShieldCheck
}

const OPTIONS: Option[] = [
  { value: null, label: 'الإدارة', hint: 'لوحة الإدارة الكاملة بكل الصلاحيات', Icon: ShieldCheck },
  ...SURFACES.map((surface) => ({
    value: surface,
    label: SURFACE_LABEL[surface],
    hint: SURFACE_HINT[surface],
    Icon: SURFACE_ICON[surface] as typeof ShieldCheck,
  })),
]

/** The row key for a target surface; `admin` stands for "leave every surface". */
function keyOf(surface: Surface | null) {
  return surface ?? 'admin'
}

export function SurfaceSwitcher({ current }: { current: Surface | null }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  // Which row is mid-flight, keyed by surface name with `admin` for "no
  // surface". `null` means idle; the sentinel is a string because a surface
  // name can never collide with it.
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const panelId = useId()

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  async function choose(surface: Surface | null) {
    // Re-selecting where you already are is a no-op, not a round trip: it would
    // rewrite the same cookie and audit an event that changed nothing.
    if (surface === current) {
      setOpen(false)
      return
    }
    setError(null)
    setBusy(keyOf(surface))
    try {
      const response = await fetch('/api/auth/surface', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ surface }),
      })
      if (!response.ok) {
        setError('تعذّر تبديل الواجهة')
        setBusy(null)
        return
      }
      const data = (await response.json()) as { redirectTo?: string }
      setOpen(false)
      startTransition(() => {
        router.refresh()
        router.push(data.redirectTo ?? '/admin')
      })
    } catch {
      setError('تعذّر تبديل الواجهة')
      setBusy(null)
    }
  }

  const ActiveIcon = current ? SURFACE_ICON[current] : ShieldCheck

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={pending}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        title="تبديل الواجهة بين الأدوار"
        className={cn(
          'flex min-h-[36px] items-center gap-2 rounded-lg border border-[#cbd9ea] bg-white px-3 text-[11px] font-medium text-[#0b1f46] transition-colors hover:bg-[#f5f9ff] disabled:opacity-60',
          error && 'border-rose-200 bg-rose-50 text-rose-600',
        )}
      >
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <ActiveIcon className="size-3.5" />}
        <span className="truncate">{error ?? (current ? SURFACE_LABEL[current] : 'الإدارة')}</span>
        <ChevronDown className="size-3.5 opacity-60" />
      </button>

      {open && (
        <div
          id={panelId}
          role="menu"
          aria-label="تبديل الواجهة"
          className="absolute left-0 top-[calc(100%+8px)] z-50 w-[268px] max-w-[calc(100vw-32px)] overflow-hidden rounded-xl border border-[#dbe6f2] bg-white shadow-2xl"
        >
          <p className="border-b border-[#eef3f9] px-3.5 py-2.5 text-[10px] font-semibold text-[#788699]">
            الواجهة الحالية — الصلاحيات تُطبَّق فورًا
          </p>
          {OPTIONS.map(({ value, label, hint, Icon }) => {
            const isCurrent = value === current
            const isBusy = busy === keyOf(value)
            return (
              <button
                key={keyOf(value)}
                type="button"
                role="menuitemradio"
                aria-checked={isCurrent}
                disabled={pending || isBusy}
                onClick={() => void choose(value)}
                className={cn(
                  'flex w-full items-start gap-2.5 px-3.5 py-2.5 text-right transition-colors hover:bg-[#f5f9ff] disabled:opacity-60',
                  isCurrent && 'bg-[#f3f8ff]',
                )}
              >
                <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-[#eef4fb] text-[#0b5cad]">
                  {isBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Icon className="size-3.5" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] font-semibold text-[#102444]">{label}</span>
                  <span className="mt-0.5 block text-[10px] leading-relaxed text-[#788699]">{hint}</span>
                </span>
                {isCurrent && <Check className="mt-1 size-3.5 shrink-0 text-[#15803d]" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
