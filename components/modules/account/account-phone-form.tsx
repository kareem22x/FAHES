'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { BadgeCheck, LoaderCircle, Phone, ShieldCheck } from 'lucide-react'
import { isValidSaudiMobile } from '@/lib/phone'

/**
 * Saves the account's phone number — no SMS code.
 *
 * ── What this replaced ───────────────────────────────────────────────────────
 *
 * The previous version created a phone on the Clerk profile and drove Clerk's
 * `prepareVerification` / `attemptVerification` pair, so the number could not be
 * stored until Clerk had texted a code to it and the user typed it back. The
 * product decision is that typing the number is the whole step, so all of that
 * machinery is gone: one input, one save, and the server marks the account
 * verified in the same write (`saveAccountPhone`).
 *
 * The trade-off lives on the server, not here — see `saveAccountPhone` for what
 * the write does and does not prove.
 *
 * ── Why the saved number is not editable by default ──────────────────────────
 *
 * The common case is "confirm what is on file", and a pre-filled editable box
 * invites a stray keystroke on a field whose value other people depend on (the
 * inspector dials it). So a stored number renders read-only with an explicit
 * «تغيير الرقم» control, and only that control opens the input.
 */
export function AccountPhoneForm({ currentPhone }: { currentPhone: string | null }) {
  const router = useRouter()
  const [phone, setPhone] = useState(currentPhone ? `0${currentPhone}` : '')
  const [editing, setEditing] = useState(currentPhone === null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function save() {
    if (!isValidSaudiMobile(phone)) {
      setError('أدخل رقم جوال سعودي صحيحًا، مثل 05XXXXXXXX.')
      return
    }

    setLoading(true)
    setError('')
    setMessage('')
    try {
      const response = await fetch('/api/account/phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      })
      const data: { error?: string; phone?: string } = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(data.error || 'تعذر حفظ رقم الجوال.')
        return
      }
      if (data.phone) setPhone(`0${data.phone}`)
      setEditing(false)
      setMessage('تم حفظ رقم جوالك في حسابك.')
      router.refresh()
    } catch {
      setError('تعذر الاتصال بالخادم. حاول مجددًا.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="app-panel" aria-labelledby="account-phone-title">
      <div className="flex items-start gap-3">
        <span className={`app-panel-icon ${currentPhone ? 'is-success' : ''}`}>
          {currentPhone ? <BadgeCheck className="size-5" /> : <Phone className="size-5" />}
        </span>
        <div>
          <h2 id="account-phone-title">رقم الجوال</h2>
          <p className="app-panel-note">
            {currentPhone
              ? 'رقمك محفوظ في حسابك. يمكنك تغييره في أي وقت.'
              : 'أضف رقم جوالك السعودي ليصلك الفاحص عليه.'}
          </p>
        </div>
      </div>

      {!editing && currentPhone ? (
        <div className="mt-5 space-y-3">
          <p className="flex items-center gap-2 rounded-xl bg-[#e9f6ef] px-4 py-3 text-sm font-bold text-[#246b4c]" dir="ltr">
            <ShieldCheck className="size-4" /> +966 {currentPhone}
          </p>
          <button
            type="button"
            onClick={() => { setEditing(true); setError(''); setMessage('') }}
            className="btn btn-ghost w-full"
          >
            تغيير الرقم
          </button>
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          <label htmlFor="account-phone-input" className="block text-xs font-bold text-[#52677f]">
            رقم الجوال السعودي
          </label>
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
          <div className="flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={loading || !isValidSaudiMobile(phone)}
              className="btn btn-dark flex-1"
            >
              {loading ? <LoaderCircle className="size-4 animate-spin" /> : <Phone className="size-4" />}
              {loading ? 'جارٍ الحفظ...' : 'حفظ الرقم'}
            </button>
            {currentPhone && (
              <button
                type="button"
                onClick={() => { setEditing(false); setPhone(`0${currentPhone}`); setError(''); setMessage('') }}
                disabled={loading}
                className="btn btn-ghost"
              >
                إلغاء
              </button>
            )}
          </div>
        </div>
      )}

      {error && <p role="alert" className="mt-3 rounded-xl bg-[#fff1f0] px-4 py-3 text-sm font-semibold text-[#a83c35]">{error}</p>}
      {message && <p role="status" className="mt-3 rounded-xl bg-[#e9f6ef] px-4 py-3 text-sm font-semibold text-[#246b4c]">{message}</p>}
    </section>
  )
}
