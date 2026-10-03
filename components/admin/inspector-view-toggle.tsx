'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Wrench } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * The owner's "enter inspector view" control.
 *
 * Rendered only for `tier === 'super_admin'`. The server re-checks ownership
 * anyway (`/api/auth/inspector-view` refuses non-owners outright), so hiding it
 * is a courtesy to plain admins rather than the security boundary — the boundary
 * is that the cookie is HttpOnly and the route re-derives the identity.
 *
 * Only the *enter* direction exists here; leaving is the job of the matching
 * control on the inspector side, so an owner always has one obvious way back.
 */
export function InspectorViewToggle({ collapsed = false }: { collapsed?: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  async function enter() {
    setError(null)
    try {
      const response = await fetch('/api/auth/inspector-view', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ view: true }),
      })
      if (!response.ok) {
        setError('تعذّر تبديل الواجهة')
        return
      }
      const data = (await response.json()) as { redirectTo?: string }
      // `refresh()` before `push()` so the destination layout re-resolves the
      // session and sees the new cookie; pushing into a cached RSC payload would
      // land on the admin console again.
      startTransition(() => {
        router.refresh()
        router.push(data.redirectTo ?? '/inspector/dashboard')
      })
    } catch {
      setError('تعذّر تبديل الواجهة')
    }
  }

  return (
    <button
      type="button"
      onClick={enter}
      disabled={pending}
      title={collapsed ? 'الدخول كمفتش' : undefined}
      className={cn(
        'flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-3 text-[11px] font-medium text-emerald-200 transition-colors hover:bg-emerald-400/15 disabled:opacity-60',
        collapsed && 'px-0',
      )}
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Wrench className="size-3.5" />}
      {!collapsed && <span className="truncate">{error ?? 'الدخول كمفتش'}</span>}
    </button>
  )
}
