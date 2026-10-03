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
    <main dir="rtl" className="flex min-h-screen items-center justify-center bg-[#f8fafc] px-5">
      <form onSubmit={submit} className="w-full max-w-md rounded-[1.5rem] border border-[#e2e8f0] bg-white p-8 shadow-[0_10px_40px_rgb(15_23_42/8%)]">
        <Link href="/" className="mb-8 flex items-center gap-3 font-black text-[#0f172a]">
          <BrandMark className="size-10 shrink-0 object-contain" />
          فاحص.
        </Link>
        <span className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-[#eff6ff] text-[#2563eb]">
          <ShieldAlert className="size-5" />
        </span>
        <h1 className="text-3xl font-black text-[#0f172a]">بوابة الإدارة</h1>
        <p className="mt-3 text-sm leading-7 text-[#64748b]">تم التحقق من الجوال. أدخل رمز الإدارة السري لإكمال الدخول.</p>
        <label className="mt-8 block text-sm font-bold text-[#0f172a]">رمز الإدارة
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            type="password"
            autoComplete="off"
            className="mt-2 w-full rounded-xl border border-[#e2e8f0] bg-[#f8fafc] px-4 py-3 text-[#0f172a] outline-none transition-colors focus:border-[#2563eb] focus:bg-white"
          />
        </label>
        {error && <p className="mt-3 text-sm text-[#e11d48]">{error}</p>}
        <button
          disabled={loading || !code}
          className="mt-6 w-full rounded-full bg-[#2563eb] py-4 font-bold text-white transition-colors hover:bg-[#1d4ed8] disabled:opacity-50"
        >
          {loading ? 'جاري التحقق...' : 'دخول لوحة الإدارة'}
        </button>
      </form>
    </main>
  )
}
