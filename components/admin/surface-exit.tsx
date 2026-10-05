'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * The way back to the admin console from a surface that is not the admin shell.
 *
 * ── Why this is separate from `SurfaceSwitcher` ────────────────────────────
 *
 * The switcher lives in the admin console's topbar, which only exists inside
 * `/admin/*`. The client surface is `/dashboard` and the inspector surface is
 * `/inspector/*` — both are their own shells, with their own design language
 * and their own CSS. Dropping the full switcher into either would either drag
 * the admin console's chrome along with it or need a second, diverging skin.
 *
 * A one-way control is also the honest shape here: from inside a surface the
 * only thing an owner wants is *out*, and the switcher is one navigation away.
 * It mirrors the inspector field's exit control, which had the same reasoning.
 *
 * Only rendered when the session is a platform owner *and* a surface is active.
 * A real customer or inspector never sees it, because for them it would be a
 * link to a console they cannot enter.
 */
export function SurfaceExit({ className }: { className?: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [failed, setFailed] = useState(false)

  async function exit() {
    setFailed(false)
    try {
      const response = await fetch('/api/auth/surface', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // `null` is the explicit "leave every surface", distinct from an absent
        // field. The route rejects anything that is neither null nor a known
        // surface name, so this cannot be coerced into an accidental switch.
        body: JSON.stringify({ surface: null }),
      })
      if (!response.ok) {
        setFailed(true)
        return
      }
      const data = (await response.json()) as { redirectTo?: string }
      // `refresh()` before `push()` so the admin shell re-resolves the session
      // and sees the cleared cookie; otherwise the cached RSC payload would
      // render the surface layout again.
      startTransition(() => {
        router.refresh()
        router.push(data.redirectTo ?? '/admin')
      })
    } catch {
      setFailed(true)
    }
  }

  return (
    <button
      type="button"
      onClick={() => void exit()}
      disabled={pending}
      title="العودة إلى لوحة الإدارة"
      className={cn(
        'inline-flex min-h-[36px] items-center gap-2 rounded-lg border border-[#cbd9ea] bg-white px-3 text-[11px] font-medium text-[#0b1f46] transition-colors hover:bg-[#f5f9ff] disabled:opacity-60',
        failed && 'border-rose-200 bg-rose-50 text-rose-600',
        className,
      )}
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldCheck className="size-3.5" />}
      <span>{failed ? 'تعذّر الرجوع' : 'العودة إلى لوحة الإدارة'}</span>
    </button>
  )
}
