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
        className="admin-btn admin-btn-sm"
      >
        <RefreshCw className={cn('size-3', spinning && 'animate-spin')} /> تحديث
      </button>
      <button
        type="button"
        onClick={() => setLive((current) => !current)}
        aria-pressed={live}
        className={cn(
          'admin-btn admin-btn-sm',
          live
            ? 'admin-btn-success'
            : '',
        )}
      >
        <span className={cn('size-1.5 rounded-full', live ? 'bg-[#10b981]' : 'bg-[#94a3b8]')} />
        بث مباشر
      </button>
    </div>
  )
}
