'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AccountPhoneForm } from '@/components/modules/account/account-phone-form'

export function VerifyIdentityForm({
  phoneVerified,
  currentPhone,
}: {
  phoneVerified: boolean
  currentPhone: string | null
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [nationalId, setNationalId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [idSubmitted, setIdSubmitted] = useState(false)

  const currentStep = phoneVerified ? (idSubmitted ? 'done' : 'nationalId') : 'phone'

  async function handleSubmitNationalId(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const cleaned = nationalId.replace(/\D/g, '')
    if (!/^[12][0-9]{9}$/.test(cleaned)) {
      setError('رقم الهوية يجب أن يكون 10 أرقام ويبدأ بـ 1 (سعودي) أو 2 (مقيم).')
      return
    }

    try {
      const res = await fetch('/api/account/verify-identity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nationalId: cleaned }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'تعذر حفظ رقم الهوية.')
        return
      }
      setIdSubmitted(true)
      startTransition(() => router.refresh())
    } catch {
      setError('تعذر الاتصال بالخادم. حاول مجددًا.')
    }
  }

  return (
    <div className="space-y-8">
      {/* Step 1: Phone */}
      <div className="rounded-2xl border border-[#0b1f46]/10 p-5">
        <div className="flex items-center gap-3">
          <span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${phoneVerified ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
            {phoneVerified ? '\u2713' : '1'}
          </span>
          <h2 className="text-base font-bold text-[#0b1f46]">توثيق رقم الجوال</h2>
        </div>
        {phoneVerified ? (
          <p className="mt-3 text-sm text-green-600 font-medium">تم توثيق رقم الجوال بنجاح.</p>
        ) : (
          <div className="mt-4">
            <AccountPhoneForm currentPhone={currentPhone} />
          </div>
        )}
      </div>

      {/* Step 2: National ID */}
      <div className={`rounded-2xl border p-5 ${phoneVerified ? 'border-[#0b1f46]/10' : 'border-[#0b1f46]/5 opacity-50'}`}>
        <div className="flex items-center gap-3">
          <span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${idSubmitted ? 'bg-green-100 text-green-700' : phoneVerified ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400'}`}>
            {idSubmitted ? '\u2713' : '2'}
          </span>
          <h2 className="text-base font-bold text-[#0b1f46]">رقم الهوية الوطنية</h2>
        </div>
        {phoneVerified && !idSubmitted && (
          <form onSubmit={handleSubmitNationalId} className="mt-4 space-y-4">
            <div>
              <label htmlFor="nationalId" className="block text-sm font-medium text-[#607087] mb-2">
                أدخل رقم هويتك (10 أرقام)
              </label>
              <input
                id="nationalId"
                type="text"
                inputMode="numeric"
                dir="ltr"
                maxLength={10}
                value={nationalId}
                onChange={(e) => setNationalId(e.target.value.replace(/\D/g, ''))}
                placeholder="1XXXXXXXXX"
                className="w-full rounded-xl border border-[#0b1f46]/15 px-4 py-3 text-center text-lg tracking-[0.3em] font-mono outline-none focus:border-[#0b1f46]/40"
              />
              <p className="mt-2 text-xs text-[#607087]">
                يبدأ بـ 1 للسعوديين أو 2 للمقيمين. 10 أرقام بالضبط.
              </p>
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <button
              type="submit"
              disabled={isPending || nationalId.length !== 10}
              className="w-full rounded-full bg-[#0b1f46] px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              حفظ وتوثيق
            </button>
          </form>
        )}
        {idSubmitted && (
          <p className="mt-3 text-sm text-green-600 font-medium">تم إدخال رقم الهوية بنجاح.</p>
        )}
      </div>

      {/* Completion */}
      {currentStep === 'done' && (
        <div className="rounded-2xl bg-green-50 border border-green-200 p-5 text-center">
          <p className="text-sm font-bold text-green-700">تم توثيق حسابك بنجاح!</p>
          <button
            onClick={() => router.push('/account')}
            className="mt-3 rounded-full bg-green-600 px-5 py-3 text-sm font-bold text-white"
          >
            المتابعة إلى حسابي
          </button>
        </div>
      )}
    </div>
  )
}
