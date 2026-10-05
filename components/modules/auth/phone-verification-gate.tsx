'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, BadgeCheck, Loader2, Lock, MessageSquareText, RefreshCw, ShieldCheck } from 'lucide-react'

/**
 * The full-screen phone-verification lock.
 *
 * Rendered by `/verify-phone`, which the proxy and the protected layouts redirect
 * to whenever `phone_verified` is false. It is deliberately not dismissable: there
 * is no close button and no backdrop click-through, so a user cannot navigate
 * past it into the product until the flag flips.
 *
 * ── On the keyboard/shortcut blocking ────────────────────────────────────────
 *
 * The overlay suppresses the usual devtools shortcuts (F12, Ctrl+Shift+I/J/C,
 * Ctrl+U) and the context menu. This is a *deterrent*, not a security boundary —
 * anyone determined can still open devtools, and it cannot be otherwise: the
 * browser belongs to the user. The real enforcement is server-side (the flag is
 * only ever set by the `consume_phone_otp` RPC), which is why blocking shortcuts
 * is safe to do here without pretending it protects anything.
 */

type Phase = 'sending' | 'sent' | 'verifying' | 'verified' | 'error'

export default function PhoneVerificationGate({
  maskedPhone,
  hasPhone,
  redirectTo,
}: {
  maskedPhone: string
  hasPhone: boolean
  redirectTo: string
}) {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('sending')
  const [code, setCode] = useState('')
  const [message, setMessage] = useState('')
  const [cooldown, setCooldown] = useState(0)
  const [lockout, setLockout] = useState(0)
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null)
  const [devCode, setDevCode] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const autoSent = useRef(false)

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

  // ── Countdowns ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (cooldown <= 0 && lockout <= 0) return
    const timer = window.setInterval(() => {
      setCooldown((value) => (value > 0 ? value - 1 : 0))
      setLockout((value) => (value > 0 ? value - 1 : 0))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [cooldown, lockout])

  const sendCode = useCallback(async () => {
    setPhase('sending')
    setMessage('')
    try {
      const response = await fetch('/api/auth/send-otp', { method: 'POST' })
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean
        error?: string
        reason?: string
        cooldownSeconds?: number
        retryAfterSec?: number
        devCode?: string
      }

      if (response.ok && payload.ok) {
        setPhase('sent')
        setCooldown(payload.cooldownSeconds ?? 60)
        setAttemptsLeft(null)
        if (payload.devCode) setDevCode(payload.devCode)
        setMessage('أرسلنا رمزًا مكوّنًا من ٦ أرقام إلى جوالك.')
        requestAnimationFrame(() => inputRef.current?.focus())
        return
      }

      if (payload.reason === 'cooldown' || payload.reason === 'rate_limited') {
        setPhase('sent')
        setCooldown(payload.retryAfterSec ?? 60)
        setMessage('تم إرسال رمز حديثًا. يمكنك طلب رمز جديد بعد انتهاء العدّاد.')
        return
      }
      if (payload.reason === 'locked') {
        setPhase('sent')
        setLockout(payload.retryAfterSec ?? 900)
        setMessage('تم قفل المحاولات مؤقتًا لحماية حسابك.')
        return
      }

      setPhase('error')
      setMessage(payload.error ?? 'تعذر إرسال الرمز. حاول مجددًا.')
    } catch {
      setPhase('error')
      setMessage('تعذر الاتصال بالخادم. تحقق من الشبكة وحاول مجددًا.')
    }
  }, [])

  useEffect(() => {
    if (!hasPhone || autoSent.current) return
    autoSent.current = true
    void sendCode()
  }, [hasPhone, sendCode])

  const verify = useCallback(
    async (candidate: string) => {
      if (candidate.length !== 6) return
      setPhase('verifying')
      setMessage('')
      try {
        const response = await fetch('/api/auth/verify-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: candidate }),
        })
        const payload = (await response.json().catch(() => ({}))) as {
          ok?: boolean
          error?: string
          reason?: string
          attemptsRemaining?: number
          retryAfterSec?: number
        }

        if (response.ok && payload.ok) {
          setPhase('verified')
          setMessage('تم توثيق جوالك. جارٍ فتح حسابك…')
          router.replace(redirectTo)
          router.refresh()
          return
        }

        setCode('')
        if (payload.reason === 'locked') {
          setLockout(payload.retryAfterSec ?? 900)
          setPhase('sent')
          setMessage('تم قفل المحاولات مؤقتًا لحماية حسابك.')
          return
        }
        if (payload.reason === 'expired' || payload.reason === 'no_challenge') {
          setPhase('sent')
          setCooldown(0)
          setMessage(payload.error ?? 'انتهت صلاحية الرمز. اطلب رمزًا جديدًا.')
          return
        }
        setPhase('sent')
        setAttemptsLeft(typeof payload.attemptsRemaining === 'number' ? payload.attemptsRemaining : null)
        setMessage(payload.error ?? 'الرمز غير صحيح.')
        requestAnimationFrame(() => inputRef.current?.focus())
      } catch {
        setPhase('sent')
        setMessage('تعذر الاتصال بالخادم. حاول مجددًا.')
      }
    },
    [redirectTo, router],
  )

  const onCodeChange = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 6)
    setCode(digits)
    if (digits.length === 6) void verify(digits)
  }

  const busy = phase === 'sending' || phase === 'verifying'

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
            <p className="text-[11px] font-medium tracking-wide text-white/60">خطوة أمنية إلزامية</p>
            <h1 id="phone-gate-title" className="text-lg font-semibold">توثيق رقم الجوال</h1>
          </div>
        </div>

        {!hasPhone ? (
          <div className="mt-6 space-y-4">
            <div className="flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-[13px] leading-6 text-amber-100">
              <AlertTriangle size={17} className="mt-0.5 shrink-0" />
              <p>لا يوجد رقم جوال سعودي موثق مرتبط بحسابك. أضف رقمًا من إعدادات الحساب ثم عد إلى هذه الصفحة.</p>
            </div>
            <a
              href="/account"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-900 transition hover:bg-white/90"
            >
              الانتقال إلى إعدادات الحساب
            </a>
          </div>
        ) : (
          <>
            <p className="mt-5 text-[13px] leading-6 text-white/70">
              أدخل الرمز المكوّن من ٦ أرقام الذي أرسلناه إلى{' '}
              <span dir="ltr" className="font-semibold text-white">{maskedPhone}</span> لفتح حسابك.
            </p>

            <div className="mt-5">
              <label htmlFor="otp-code" className="mb-2 block text-[12px] font-medium text-white/70">
                رمز التحقق
              </label>
              <input
                id="otp-code"
                ref={inputRef}
                dir="ltr"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(event) => onCodeChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && code.length === 6) void verify(code)
                }}
                placeholder="••••••"
                disabled={busy || lockout > 0}
                className="w-full rounded-xl border border-white/15 bg-white/[0.04] px-4 py-4 text-center text-3xl font-semibold tracking-[0.5em] text-white placeholder:text-white/25 outline-none transition focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-400/25 disabled:opacity-50"
              />
            </div>

            {message && (
              <div
                className={`mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-[12px] leading-5 ${
                  phase === 'error'
                    ? 'bg-rose-500/15 text-rose-200'
                    : phase === 'verified'
                      ? 'bg-emerald-500/15 text-emerald-200'
                      : 'bg-white/[0.06] text-white/70'
                }`}
              >
                {phase === 'verified' ? (
                  <BadgeCheck size={15} className="mt-0.5 shrink-0" />
                ) : (
                  <Lock size={15} className="mt-0.5 shrink-0" />
                )}
                <span>{message}</span>
              </div>
            )}

            {attemptsLeft !== null && attemptsLeft > 0 && (
              <p className="mt-2 text-[11px] text-amber-200/90">
                المحاولات المتبقية قبل القفل المؤقت: {attemptsLeft}
              </p>
            )}

            {devCode && (
              <p className="mt-2 rounded-lg bg-sky-500/10 px-3 py-2 text-[11px] text-sky-200">
                وضع التطوير: الرمز الحالي هو <span dir="ltr" className="font-semibold">{devCode}</span>
              </p>
            )}

            <div className="mt-5 flex flex-col gap-3">
              <button
                type="button"
                onClick={() => void verify(code)}
                disabled={busy || code.length !== 6 || lockout > 0}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {phase === 'verifying' ? <Loader2 size={17} className="animate-spin" /> : <BadgeCheck size={17} />}
                {phase === 'verifying' ? 'جارٍ التحقق…' : 'تأكيد الرمز'}
              </button>

              <button
                type="button"
                onClick={() => void sendCode()}
                disabled={busy || cooldown > 0 || lockout > 0}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 px-4 py-3 text-[13px] font-medium text-white/80 transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <RefreshCw size={15} className={phase === 'sending' ? 'animate-spin' : ''} />
                {lockout > 0
                  ? `القفل مؤقت — حاول بعد ${Math.ceil(lockout / 60)} دقيقة`
                  : cooldown > 0
                    ? `إعادة إرسال الرمز بعد ${cooldown} ثانية`
                    : 'إعادة إرسال الرمز'}
              </button>
            </div>

            <p className="mt-5 flex items-center justify-center gap-1.5 text-center text-[11px] text-white/45">
              <MessageSquareText size={13} />
              لم يصلك الرمز؟ تأكد من تغطية الشبكة، أو تواصل مع الدعم الفني.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
