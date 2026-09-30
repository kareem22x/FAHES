'use client'

import { useRouter } from 'next/navigation'
import type { AppUser } from '@/lib/types'

export function InspectorActions({ user }: { user: AppUser }) {
  const router = useRouter()

  async function setStatus(status: 'approved' | 'rejected' | 'suspended') {
    await fetch(`/api/admin/inspectors/${user.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    router.refresh()
  }

  if (user.inspectorStatus === 'pending') {
    return (
      <div className="flex gap-1">
        <button type="button" onClick={() => setStatus('approved')} className="rounded-full bg-[#eaf5ed] px-3 py-1 text-xs font-bold text-[#39764d]">اعتماد</button>
        <button type="button" onClick={() => setStatus('rejected')} className="rounded-full bg-[#fff0ed] px-3 py-1 text-xs font-bold text-[#ae5146]">رفض</button>
      </div>
    )
  }

  if (user.role === 'inspector') {
    return <button type="button" onClick={() => setStatus('suspended')} className="rounded-full bg-[#fff6dc] px-3 py-1 text-xs font-bold text-[#956f19]">إيقاف</button>
  }

  return null
}
