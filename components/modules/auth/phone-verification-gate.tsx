'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BadgeCheck, Loader2, Phone, ShieldCheck } from 'lucide-react'
import { isValidSaudiMobile } from '@/lib/phone'

/**
 * The full-screen phone wall.
 *
 * Rendered by `/verify-phone`, which the proxy and the protected layouts redirect
 * to whenever `phone_verified` is false. It is deliberately not dismissable: no
 * close button, no backdrop click-through, so a user cannot walk past it into the
 * product until the flag flips.
 *
 * ── What changed, and why the wall still exists ──────────────────────────────
 *
 * This used to drive an SMS code: it auto-sent on mount, ran a 60-second resend
 * cooldown, a lockout after too many wrong attempts, and a six-digit input that
 * submitted itself on the sixth keystroke. The product decision is that typing
 * the number *is* the verification, so all of that is gone — the component now
 * has one field, one button, and no timer, no attempts counter and no resend.
 *
 * The wall itself is kept because the gate is still real: `/inspector`,
 * `/admin`, `/dashboard` and `/support` all refuse to render for an account with
 * no phone on file, and this is the one page allowed to say so. What the server
 * proves when the number is saved is a separate question — see
 * `saveAccountPhone`.
 *
 * ── On the keyboard/shortcut blocking ────────────────────────────────────────
 *
 * The overlay suppresses the usual devtools shortcuts (F12, Ctrl+Shift+I/J/C,
 * Ctrl+U) and the context menu. This is a *deterrent*, not a security boundary —
 * anyone determined can still open devtools, and it cannot be otherwise: the
 * browser belongs to the user. The real enforcement is server-side, which is why
 * blocking shortcuts is safe to do here without pretending it protects anything.
 */
export default function PhoneVerificationGate({
  currentPhone,
  redirectTo,
}: {
  currentPhone: string | null
  redirectTo: string
}) {
  const router = useRouter()
  const [phone, setPhone] = useState(currentPhone ? `0${currentPhone}` : '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // ── Shortcut deterrence ───────────────────────────────────────────────────
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const key = event.key.toLowerCase()
      const devtoolsCombo =
        event.key === 'F12' ||
        (event.ctrlKey && event.shiftKey && (key === 'i' || key === 'j' || key === 'c')) ||
        (event.ctrlKey && key === 'u') ||
        (event.metaKey && event.altKey && (key === 'i' || key === 'j' || key === 'c'))
      if (devtoolsCombo) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    function onContextMenu(event: MouseEvent) {
      event.preventDefault()
    }
    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('contextmenu', onContextMenu)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('contextmenu', onContextMenu)
    }
  }, [])

  // Focus the field on mount. There is no auto-submit any more: the previous
  // version fired a request the moment the page opened, which is only safe for a
  // resend and is exactly wrong for a write.
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const save = useCallback(async () => {
    if (!isValidSaudiMobile(phone)) {
      setError('أدخل رقم جوال سعودي صحيحًا، مثل 05XXXXXXXX.')
      return
    }

    setSaving(true)
    setError('')
    try {
      const response = await fetch('/api/account/phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      })
      const payload = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) {
        setError(payload.error ?? 'تعذر حفظ رقم الجوال. حاول مجددًا.')
        return
      }
      setSaved(true)
      router.replace(redirectTo)
      router.refresh()
    } catch {
      setError('تعذر الاتصال بالخادم. تحقق من الشبكة وحاول مجددًا.')
    } finally {
      setSaving(false)
    }
  }, [phone, redirectTo, router])

  const valid = isValidSaudiMobile(phone)

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto bg-slate-950/90 p-4 backdrop-blur-xl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="phone-gate-title"
      dir="rtl"
    >
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.06] p-6 text-white shadow-2xl sm:p-8">
        <div className="flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/30">
            <ShieldCheck size={22} />
          </span>
          <div>
            <p className="text-[11px] font-medium tracking-wide text-white/60">خطوة أخيرة قبل الدخول</p>
            <h1 id="phone-gate-title" className="text-lg font-semibold">أدخل رقم جوالك</h1>
          </div>
        </div>

        <p className="mt-5 text-[13px] leading-6 text-white/70">
          نحتاج رقم جوالك السعودي ليصلك الفاحص عليه. يُحفظ الرقم في حسابك مباشرة — بلا رسائل ولا رمز تحقق.
        </p>

        <div className="mt-5">
          <label htmlFor="gate-phone" className="mb-2 block text-[12px] font-medium text-white/70">
            رقم الجوال السعودي
          </label>
          <div className="flex gap-2" dir="ltr">
            <span className="flex shrink-0 items-center rounded-xl border border-white/15 bg-white/[0.04] px-3 text-sm font-semibold text-white/70">+966</span>
            <input
              id="gate-phone"
              ref={inputRef}
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              maxLength={16}
              value={phone}
              onChange={(event) => {
                setPhone(event.target.value)
                setError('')
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && valid) void save()
              }}
              placeholder="05XXXXXXXX"
              disabled={saving || saved}
              /* The `!` marks are not decoration. `globals.css` styles
                 `input, textarea, select` *unlayered*, and an unlayered rule
                 outranks every Tailwind utility regardless of specificity — so
                 the plain classes lost and this field rendered as an opaque
                 white box on the dark card, at 13.5px with the base padding.
                 v4's `!` suffix is what lifts a utility back above it. */
              className="min-w-0 flex-1 rounded-xl! border border-white/15! bg-white/[0.04]! px-4! py-4! text-center text-xl! font-semibold tracking-[0.2em] text-white! placeholder:text-white/25! outline-none transition focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-400/25 disabled:opacity-50"
            />
          </div>
        </div>

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-rose-500/15 px-3 py-2 text-[12px] leading-5 text-rose-200">
            <span>{error}</span>
          </div>
        )}

        {saved && (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-emerald-500/15 px-3 py-2 text-[12px] leading-5 text-emerald-200">
            <BadgeCheck size={15} className="mt-0.5 shrink-0" />
            <span>تم حفظ رقمك. جارٍ فتح حسابك…</span>
          </div>
        )}

        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || saved || !valid}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? <Loader2 size={17} className="animate-spin" /> : <Phone size={17} />}
          {saving ? 'جارٍ الحفظ…' : 'حفظ ومتابعة'}
        </button>

        <p className="mt-5 flex items-center justify-center gap-1.5 text-center text-[11px] text-white/45">
          <ShieldCheck size={13} />
          رقمك يظهر للفاحص المسند إلى طلبك فقط.
        </p>
      </div>
    </div>
  )
}
