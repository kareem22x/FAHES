'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, ShieldCheck } from 'lucide-react'

/**
 * The mirror of `InspectorViewToggle`: an owner's way back to the admin console.
 *
 * Rendered only when the session is a platform owner *and* inspector view mode
 * is on. A real inspector never sees it, because for them it would be a link to
 * a console they cannot enter.
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
      const response = await fetch('/api/auth/inspector-view', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ view: false }),
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
