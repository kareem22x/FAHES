'use client'

import Link from 'next/link'
import BrandMark from '@/components/brand-mark'
import { ShieldAlert } from 'lucide-react'
import { useState } from 'react'

export function AdminGateForm() {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const response = await fetch('/api/auth/admin-unlock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })
    const data = await response.json()
    setLoading(false)
    if (!response.ok) {
      setError(data.error || 'تعذر فتح لوحة الإدارة')
      return
    }
    window.location.href = data.redirectTo || '/admin'
  }

  return (
    <main dir="rtl" className="flex min-h-screen items-center justify-center bg-[#061632] px-5 text-white">
      <form onSubmit={submit} className="w-full max-w-md rounded-[2rem] border border-white/10 bg-white/[.04] p-8">
        <Link href="/" className="mb-8 flex items-center gap-3 font-black"><BrandMark className="size-10 shrink-0 object-contain" />فاحص.</Link>
        <span className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-[#1385f5]/15 text-[#1385f5]"><ShieldAlert className="size-5" /></span>
        <h1 className="text-3xl font-black">بوابة الإدارة</h1>
        <p className="mt-3 text-sm leading-7 text-white/60">تم التحقق من الجوال. أدخل رمز الإدارة السري لإكمال الدخول.</p>
        <label className="mt-8 block text-sm font-bold">رمز الإدارة
          <input value={code} onChange={(e) => setCode(e.target.value)} type="password" autoComplete="off" className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none focus:border-[#1385f5]" />
        </label>
        {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
        <button disabled={loading || !code} className="mt-6 w-full rounded-full bg-[#1385f5] py-4 font-black text-[#0b1f46] disabled:opacity-50">{loading ? 'جاري التحقق...' : 'دخول لوحة الإدارة'}</button>
      </form>
    </main>
  )
}
