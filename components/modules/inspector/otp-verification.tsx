'use client'

import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useUser } from '@clerk/nextjs'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { ArrowLeft, BadgeCheck, LoaderCircle, Lock, Phone, RefreshCw, ShieldCheck, Smartphone } from 'lucide-react'
import { OtpField } from '@/components/motion/otp-field'
import { EASE_OUT_EXPO, springSoft, tapPress } from '@/components/motion/motion-presets'
import { collectDeviceSignature, deviceLabel } from '@/lib/device-signature'
import { notifyNavigationStart } from '@/lib/navigation'
import { e164Saudi, isValidSaudiMobile, normalizePhone } from '@/lib/phone'

// lottie-web owns its DOM box and must never be server-rendered.
const SuccessAnimation = dynamic(() => import('@/components/motion/success-animation'), { ssr: false })

type Step = 'phone' | 'code' | 'success'

type PhoneVerificationResource = {
  phoneNumber: string
  verification: { status: string }
  prepareVerification: () => Promise<PhoneVerificationResource>
  attemptVerification: (params: { code: string }) => Promise<PhoneVerificationResource>
}

/** Short buzz on accepted input, a triple pulse on rejection. */
function haptic(pattern: number | number[]) {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return
  try {
    navigator.vibrate(pattern)
  } catch {
    // Vibration is a nicety; unsupported or blocked is not an error.
  }
}

/** `useSyncExternalStore` subscription for a value that never changes. */
function subscribeToNothing() {
  return () => {}
}

function clerkErrorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'errors' in error && Array.isArray(error.errors)) {
    const message = error.errors
      .map((item) => (item && typeof item === 'object' && 'longMessage' in item
        ? item.longMessage
        : item && typeof item === 'object' && 'message' in item
          ? item.message
          : null))
      .find((item): item is string => typeof item === 'string')
    if (message?.toLowerCase().includes('already exists')) {
      return 'رقم الجوال مرتبط بحساب آخر في خدمة تسجيل الدخول.'
    }
    if (message) return message
  }
  return 'تعذر إكمال التحقق. تأكد من إعداد إرسال الرسائل وحاول مرة أخرى.'
}

/**
 * Mobile-only inspector verification.
 *
 * Three steps share one animated surface: confirm the phone, enter the SMS
 * code, then bind the phone to the inspector account. The code is checked by
 * Clerk (the SMS provider is configured there); this component owns the flow,
 * the device binding and the motion.
 */
export default function InspectorOtpVerification({ verifiedPhone }: { verifiedPhone: string | null }) {
  const router = useRouter()
  const { isLoaded, isSignedIn, user } = useUser()

  const [step, setStep] = useState<Step>('phone')
  const [phone, setPhone] = useState(verifiedPhone ? `0${verifiedPhone}` : '')
  const [code, setCode] = useState('')
  const [verification, setVerification] = useState<PhoneVerificationResource | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [resendKey, setResendKey] = useState(0)
  const [boundDevice, setBoundDevice] = useState('')

  // `navigator` only exists on the client. Reading it through
  // `useSyncExternalStore` with an empty server snapshot avoids both a
  // hydration mismatch and a setState-inside-an-effect render cascade.
  const localDevice = useSyncExternalStore(
    subscribeToNothing,
    () => deviceLabel(navigator.userAgent),
    () => '',
  )

  // One interval per code step; it self-neutralises at zero rather than
  // clearing itself, which keeps the effect free of state writes.
  useEffect(() => {
    if (step !== 'code') return
    const timer = window.setInterval(() => {
      setSecondsLeft((value) => (value <= 1 ? 0 : value - 1))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [step, resendKey])

  const sendCode = useCallback(async () => {
    if (!isLoaded || !isSignedIn || !user) {
      setError('تعذر تحميل حسابك. حدّث الصفحة وحاول مرة أخرى.')
      return
    }
    if (!isValidSaudiMobile(phone)) {
      setError('أدخل رقم جوال سعودي صحيحًا، مثل 05XXXXXXXX.')
      haptic([30, 40, 30])
      return
    }

    setLoading(true)
    setError('')
    try {
      const normalized = normalizePhone(phone)
      const existing = user.phoneNumbers.find((item) => normalizePhone(item.phoneNumber) === normalized)
      const phoneNumber = existing ?? await user.createPhoneNumber({ phoneNumber: e164Saudi(phone) })
      const prepared = await phoneNumber.prepareVerification()
      setVerification(prepared as PhoneVerificationResource)
      setPhone(phoneNumber.phoneNumber.replace('+966', '0'))
      setCode('')
      setStep('code')
      setSecondsLeft(60)
      setResendKey((key) => key + 1)
      haptic(12)
    } catch (caught) {
      setError(clerkErrorMessage(caught))
      haptic([30, 40, 30])
    } finally {
      setLoading(false)
    }
  }, [isLoaded, isSignedIn, phone, user])

  const verifyCode = useCallback(
    async (submitted: string) => {
      if (!verification || !user || loading) return
      if (!/^\d{6}$/.test(submitted)) {
        setError('أدخل الرمز المكوّن من 6 أرقام.')
        haptic([30, 40, 30])
        return
      }

      setLoading(true)
      setError('')
      try {
        const result = await verification.attemptVerification({ code: submitted })
        if (result.verification.status !== 'verified') throw new Error('invalid_code')
        await user.reload()

        // Bind the phone to the inspector account before letting them in.
        const signature = await collectDeviceSignature()
        if (!signature.isMobile) {
          setError('تطبيق الفاحص يعمل على الجوال فقط. افتح الرابط من جوالك.')
          haptic([30, 40, 30])
          setCode('')
          return
        }

        const response = await fetch('/api/inspectors/device', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            hash: signature.hash,
            label: signature.label,
            platform: signature.platform,
          }),
        })
        const data: { error?: string } = await response.json()
        if (!response.ok) {
          setError(data.error || 'تعذر ربط الجهاز بحساب الفاحص.')
          haptic([30, 40, 30])
          setCode('')
          return
        }

        setBoundDevice(signature.label)
        setStep('success')
        haptic([12, 40, 12])
        window.setTimeout(() => {
          notifyNavigationStart('/inspector/dashboard')
          router.replace('/inspector/dashboard')
          router.refresh()
        }, 1800)
      } catch (caught) {
        setError(
          caught instanceof Error && caught.message === 'invalid_code'
            ? 'الرمز غير صحيح. تحقق من الرسالة وحاول مرة أخرى.'
            : clerkErrorMessage(caught),
        )
        haptic([30, 40, 30])
        setCode('')
      } finally {
        setLoading(false)
      }
    },
    [loading, router, user, verification],
  )

  return (
    <div className="verify-shell">
      <motion.section
        className="verify-card"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: EASE_OUT_EXPO }}
      >
        <header className="verify-head">
          <span className="verify-badge">
            <Smartphone size={15} /> دخول الفاحص من الجوال
          </span>
          <h1>
            {step === 'success' ? 'تم التحقق' : step === 'code' ? 'أدخل رمز التحقق' : 'تأكيد رقم الجوال'}
          </h1>
          <p>
            {step === 'success'
              ? 'تم ربط هذا الجوال بحسابك كجهاز ميداني معتمد.'
              : step === 'code'
                ? 'أرسلنا رمزًا مكوّنًا من 6 أرقام برسالة نصية.'
                : 'نرسل رمزًا نصيًا للتأكد أنك تستخدم جوالك الشخصي في العمل الميداني.'}
          </p>
        </header>

        <AnimatePresence mode="wait" initial={false}>
          {step === 'phone' && (
            <motion.div
              key="phone"
              className="verify-step"
              initial={{ opacity: 0, x: 18 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -18 }}
              transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}
            >
              <label htmlFor="inspector-phone" className="verify-label">رقم الجوال السعودي</label>
              <div className="verify-phone-row" dir="ltr">
                <span className="verify-prefix">+966</span>
                <input
                  id="inspector-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel-national"
                  maxLength={16}
                  value={phone}
                  onChange={(event) => {
                    setPhone(event.target.value)
                    setError('')
                  }}
                  placeholder="05XXXXXXXX"
                  className="verify-input"
                />
              </div>
              <motion.button
                type="button"
                onClick={sendCode}
                disabled={loading || !isLoaded}
                className="btn btn-dark verify-submit"
                whileTap={tapPress}
                transition={springSoft}
              >
                {loading ? <LoaderCircle className="size-4 animate-spin" /> : <Phone className="size-4" />}
                {loading ? 'جارٍ الإرسال...' : 'إرسال رمز التحقق'}
              </motion.button>
            </motion.div>
          )}

          {step === 'code' && (
            <motion.div
              key="code"
              className="verify-step"
              initial={{ opacity: 0, x: 18 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -18 }}
              transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}
            >
              <p className="verify-note">
                أُرسل الرمز إلى <span dir="ltr" className="verify-phone">{verification?.phoneNumber}</span>
              </p>
              <OtpField
                value={code}
                onChange={(next) => {
                  setCode(next)
                  setError('')
                }}
                onComplete={verifyCode}
                disabled={loading}
                error={Boolean(error)}
              />
              <div className="verify-timer" aria-live="polite">
                {secondsLeft > 0 ? (
                  <>
                    <span className="verify-timer-dot" aria-hidden="true" />
                    إعادة الإرسال خلال <span dir="ltr">{secondsLeft}</span> ثانية
                  </>
                ) : (
                  <button
                    type="button"
                    className="verify-resend"
                    onClick={sendCode}
                    disabled={loading}
                  >
                    <RefreshCw size={14} /> إعادة إرسال الرمز
                  </button>
                )}
              </div>
              <button
                type="button"
                className="verify-back"
                onClick={() => {
                  setStep('phone')
                  setCode('')
                  setError('')
                  setVerification(null)
                }}
                disabled={loading}
              >
                <ArrowLeft size={14} /> تغيير رقم الجوال
              </button>
            </motion.div>
          )}

          {step === 'success' && (
            <motion.div
              key="success"
              className="verify-step verify-success"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
            >
              <span className="verify-lottie" aria-hidden="true">
                <SuccessAnimation className="verify-lottie-canvas" />
              </span>
              <p className="verify-success-title">
                <BadgeCheck size={18} /> تم التحقق وربط الجهاز
              </p>
              <p className="verify-note">جارٍ تحويلك إلى مساحة العمل...</p>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {error && (
            <motion.p
              role="alert"
              className="verify-error"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2, ease: EASE_OUT_EXPO }}
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>

        <footer className="verify-foot">
          <span><ShieldCheck size={14} /> تحقق برسالة نصية</span>
          <span><Lock size={14} /> قفل الجهاز الميداني</span>
          {boundDevice && <span><Smartphone size={14} /> {boundDevice}</span>}
          {!boundDevice && localDevice && <span><Smartphone size={14} /> {localDevice}</span>}
        </footer>
      </motion.section>
    </div>
  )
}
