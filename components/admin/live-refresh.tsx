'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Live-ish event stream control.
 *
 * Rather than opening a websocket (Supabase Realtime would need RLS plus a
 * client-side key, which this app deliberately does not expose), the server
 * component is simply re-rendered on an interval. All data access stays
 * server-side, and the page stays a server component.
 */
export function LiveRefresh({ intervalMs = 30_000 }: { intervalMs?: number }) {
  const router = useRouter()
  const [live, setLive] = useState(false)
  const [spinning, setSpinning] = useState(false)

  useEffect(() => {
    if (!live) return
    const id = window.setInterval(() => router.refresh(), intervalMs)
    return () => window.clearInterval(id)
  }, [live, intervalMs, router])

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => {
          setSpinning(true)
          router.refresh()
          window.setTimeout(() => setSpinning(false), 600)
        }}
        className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-neutral-300 transition-colors hover:bg-white/10"
      >
        <RefreshCw className={cn('size-3', spinning && 'animate-spin')} /> تحديث
      </button>
      <button
        type="button"
        onClick={() => setLive((current) => !current)}
        aria-pressed={live}
        className={cn(
          'flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] transition-colors',
          live
            ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
            : 'border-white/10 bg-white/5 text-neutral-400 hover:bg-white/10',
        )}
      >
        <span className={cn('size-1.5 rounded-full', live ? 'bg-emerald-400' : 'bg-neutral-500')} />
        بث مباشر
      </button>
    </div>
  )
}
