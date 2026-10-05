'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, ShieldCheck } from 'lucide-react'

/**
 * The way back to the admin console from the inspector field surface.
 *
 * ── Why it now calls `/api/auth/surface` ───────────────────────────────────
 *
 * It used to POST `{ view: false }` to `/api/auth/inspector-view`, which cleared
 * `fahes_inspector_view`. That cookie has been superseded by `fahes_surface`,
 * and `getSession()` reads the old one as a *fallback* when the new one is
 * absent — so clearing only the legacy cookie would leave an owner who entered
 * through the new switcher pinned to the inspector surface with no way out.
 * Both routes now share one cookie and one clearing path.
 *
 * Deliberately placed in the inspector topbar next to the logout control — the
 * one row an owner will look at when they have finished in the field, and where
 * "which account am I in" is already answered by the status pill beside it.
 */
export function ExitInspectorView() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [failed, setFailed] = useState(false)

  async function exit() {
    setFailed(false)
    try {
      const response = await fetch('/api/auth/surface', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ surface: null }),
      })
      if (!response.ok) {
        setFailed(true)
        return
      }
      const data = (await response.json()) as { redirectTo?: string }
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
      onClick={exit}
      disabled={pending}
      className="field-exit-view"
      title="العودة إلى لوحة الإدارة"
    >
      {pending ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
      <span>{failed ? 'تعذّر الرجوع' : 'واجهة الإدارة'}</span>
    </button>
  )
}
