'use client'

import { useActionState } from 'react'
import { useRouter } from 'next/navigation'
import { GlassBadge } from '@/components/admin/ui/glass'
import { toggleKillSwitchAction, type ExtActionState } from '@/lib/admin/extended-actions'
import { Power } from 'lucide-react'

export function KillSwitchToggle({ current }: { current: boolean }) {
  const router = useRouter()
  const [state, formAction] = useActionState<ExtActionState, FormData>(toggleKillSwitchAction, { ok: false, message: '' })

  if (state.ok) {
    setTimeout(() => router.refresh(), 100)
  }

  return (
    <div className="flex items-center gap-2">
      <GlassBadge tone={current ? 'bad' : 'good'}>
        {current ? 'متوقف' : 'يعمل'}
      </GlassBadge>
      <form action={formAction}>
        <input type="hidden" name="globalDisabled" value={String(!current)} />
        <button
          type="submit"
          className={`admin-btn admin-btn-sm ${current ? 'admin-btn-success' : 'admin-btn-danger'}`}
        >
          <Power size={12} />
          {current ? 'تفعيل' : 'إيقاف'}
        </button>
      </form>
    </div>
  )
}
