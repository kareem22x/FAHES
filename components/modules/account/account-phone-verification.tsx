'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useUser } from '@clerk/nextjs'
import { BadgeCheck, LoaderCircle, Phone, ShieldCheck } from 'lucide-react'
import { e164Saudi, isValidSaudiMobile, normalizePhone } from '@/lib/phone'

type AccountPhoneVerificationProps = {
  verifiedPhone: string | null
  databasePhone: string | null
}

type PhoneVerificationResource = {
  id: string
  phoneNumber: string
  verification: { status: string }
  prepareVerification: () => Promise<PhoneVerificationResource>
  attemptVerification: (params: { code: string }) => Promise<PhoneVerificationResource>
}

function clerkErrorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'errors' in error && Array.isArray(error.errors)) {
    const message = error.errors
      .map((item) => item && typeof item === 'object' && 'longMessage' in item
        ? item.longMessage
        : item && typeof item === 'object' && 'message' in item
          ? item.message
          : null)
      .find((item): item is string => typeof item === 'string')
    if (message?.toLowerCase().includes('already exists')) {
      return 'رقم الجوال مرتبط بحساب آخر في خدمة تسجيل الدخول.'
    }
    if (message) return message
  }
  return 'تعذر إكمال التحقق. تأكد من إعداد إرسال الرسائل في Clerk وحاول مرة أخرى.'
}

export function AccountPhoneVerification({
  verifiedPhone,
  databasePhone,
}: AccountPhoneVerificationProps) {
  const router = useRouter()
  const { isLoaded, isSignedIn, user } = useUser()
  const [phone, setPhone] = useState(verifiedPhone ? `0${verifiedPhone}` : '')
  const [code, setCode] = useState('')
  const [verification, setVerification] = useState<PhoneVerificationResource | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function syncVerifiedPhone() {
    const response = await fetch('/api/account/phone', { method: 'POST' })
    const data: { error?: string } = await response.json()
    if (!response.ok) throw new Error(data.error || 'تعذر ربط الرقم بملف الحساب.')
    setMessage('تم توثيق رقم الجوال وربطه بحسابك.')
    router.refresh()
  }

  async function sendCode() {
    if (!isLoaded || !isSignedIn || !user) {
      setError('تعذر تحميل حسابك. حدّث الصفحة وحاول مرة أخرى.')
      return
    }
    if (!isValidSaudiMobile(phone)) {
      setError('أدخل رقم جوال سعودي صحيحًا، مثل 05XXXXXXXX.')
      return
    }

    setLoading(true)
    setError('')
    setMessage('')
    try {
      const normalized = normalizePhone(phone)
      const existing = user.phoneNumbers.find((item) => normalizePhone(item.phoneNumber) === normalized)
      if (existing?.verification.status === 'verified') {
        await syncVerifiedPhone()
        return
      }

      const phoneNumber = existing ?? await user.createPhoneNumber({ phoneNumber: e164Saudi(phone) })
      const prepared = await phoneNumber.prepareVerification()
      setVerification(prepared as PhoneVerificationResource)
      setPhone(phoneNumber.phoneNumber.replace('+966', '0'))
      setMessage('أرسلنا رمز التحقق إلى رقم الجوال.')
    } catch (caught) {
      setError(clerkErrorMessage(caught))
    } finally {
      setLoading(false)
    }
  }

  async function verifyCode() {
    if (!verification || !user) return
    const cleanCode = code.replace(/\s/g, '')
    if (!/^\d{4,8}$/.test(cleanCode)) {
      setError('أدخل رمز التحقق المكوّن من 4 إلى 8 أرقام.')
      return
    }

    setLoading(true)
    setError('')
    setMessage('')
    try {
      const result = await verification.attemptVerification({ code: cleanCode })
      if (result.verification.status !== 'verified') {
        setError('لم يكتمل التحقق من الرقم. تحقق من الرمز وحاول مرة أخرى.')
        return
      }
      await user.reload()
      await syncVerifiedPhone()
      setVerification(null)
      setCode('')
    } catch (caught) {
      setError(clerkErrorMessage(caught))
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="app-panel" aria-labelledby="account-phone-title">
      <div className="flex items-start gap-3">
        <span className={`app-panel-icon ${databasePhone ? 'is-success' : ''}`}>
          {databasePhone ? <BadgeCheck className="size-5" /> : <Phone className="size-5" />}
        </span>
        <div>
          <h2 id="account-phone-title">رقم الجوال</h2>
          <p className="app-panel-note">
            {databasePhone
              ? 'رقمك موثّق ومربوط بحسابك.'
              : verifiedPhone
                ? 'رقمك موثّق لدى Clerk؛ اربطه بملف الحساب لإكمال إعداداته.'
                : 'أضف رقم جوالك ووثّقه برمز SMS. يبقى اختياريًا لحساب العميل.'}
          </p>
        </div>
      </div>

      {databasePhone ? (
        <p className="mt-5 flex items-center gap-2 rounded-xl bg-[#e9f6ef] px-4 py-3 text-sm font-bold text-[#246b4c]" dir="ltr">
          <ShieldCheck className="size-4" /> +966 {databasePhone}
        </p>
      ) : (
        <div className="mt-5 space-y-3">
          {!verification ? (
            <>
              <label htmlFor="account-phone-input" className="block text-xs font-bold text-[#52677f]">رقم الجوال السعودي</label>
              <div className="flex gap-2" dir="ltr">
                <span className="flex shrink-0 items-center rounded-xl border border-[#dce6f1] bg-[#f6f9ff] px-3 text-sm font-bold text-[#52677f]">+966</span>
                <input
                  id="account-phone-input"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel-national"
                  maxLength={16}
                  value={phone}
                  onChange={(event) => { setPhone(event.target.value); setError(''); setMessage('') }}
                  placeholder="05XXXXXXXX"
                  className="min-w-0 flex-1 rounded-xl border border-[#dce6f1] px-4 py-3 text-sm outline-none transition focus:border-[#0873d1] focus:ring-4 focus:ring-[#0873d1]/10"
                />
              </div>
              <button type="button" onClick={sendCode} disabled={loading || !isLoaded} className="btn btn-dark w-full">
                {loading ? <LoaderCircle className="size-4 animate-spin" /> : <Phone className="size-4" />}
                {loading ? 'جارٍ الإرسال...' : verifiedPhone ? 'مزامنة الرقم الموثّق' : 'إرسال رمز التحقق'}
              </button>
            </>
          ) : (
            <>
              <p className="text-xs leading-6 text-[#52677f]">أدخل الرمز الذي أرسلناه إلى <span dir="ltr" className="font-bold">{verification.phoneNumber}</span>.</p>
              <label htmlFor="account-phone-code" className="block text-xs font-bold text-[#52677f]">رمز التحقق</label>
              <input
                id="account-phone-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={8}
                value={code}
                onChange={(event) => { setCode(event.target.value.replace(/\D/g, '').slice(0, 8)); setError('') }}
                placeholder="أدخل رمز SMS"
                className="w-full rounded-xl border border-[#dce6f1] px-4 py-3 text-center text-lg tracking-[.3em] outline-none transition focus:border-[#0873d1] focus:ring-4 focus:ring-[#0873d1]/10"
              />
              <div className="flex gap-2">
                <button type="button" onClick={verifyCode} disabled={loading} className="btn btn-dark flex-1">
                  {loading && <LoaderCircle className="size-4 animate-spin" />}
                  {loading ? 'جارٍ التحقق...' : 'تحقق من الرقم'}
                </button>
                <button type="button" onClick={() => { setVerification(null); setCode(''); setError(''); setMessage('') }} disabled={loading} className="btn btn-ghost">تغيير</button>
              </div>
            </>
          )}
        </div>
      )}

      {error && <p role="alert" className="mt-3 rounded-xl bg-[#fff1f0] px-4 py-3 text-sm font-semibold text-[#a83c35]">{error}</p>}
      {message && <p role="status" className="mt-3 rounded-xl bg-[#e9f6ef] px-4 py-3 text-sm font-semibold text-[#246b4c]">{message}</p>}
    </section>
  )
}
