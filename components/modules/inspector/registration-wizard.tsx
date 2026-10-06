'use client'

import { useState } from 'react'
import { useSignUp } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Eye,
  EyeOff,
  LoaderCircle,
  Mail,
  Phone,
  Send,
  ShieldCheck,
  User,
} from 'lucide-react'
import { e164Saudi, isValidSaudiMobile } from '@/lib/phone'
import {
  EMPTY_APPLICATION_DRAFT,
  coverageStepError,
  draftToPayload,
  identityStepError,
  type InspectorApplicationDraft,
} from '@/lib/inspector-application'
import { fieldClassName } from '@/components/modules/inspector/application/fields'
import { ApplicationReview } from '@/components/modules/inspector/application/review'
import { CoverageStep } from '@/components/modules/inspector/application/step-coverage'
import { IdentityStep } from '@/components/modules/inspector/application/step-identity'

/**
 * Clerk rejects shorter passwords (`auth_password.min_length = 15` on the linked
 * instance), so the client-side check has to agree with it — otherwise an
 * 8-character password passes the form and comes back as a server-side error.
 */
const PASSWORD_MIN_LENGTH = 15

const STEPS = [
  { label: 'البيانات الأساسية', icon: User },
  { label: 'بيانات الحساب', icon: ShieldCheck },
  { label: 'توثيق الجوال', icon: Phone },
  { label: 'توثيق البريد', icon: Mail },
  { label: 'التغطية والتوفر', icon: BadgeCheck },
  { label: 'مراجعة وإرسال', icon: Send },
] as const

const FIRST_INPUT_STEP = 0
const ACCOUNT_STEP = 1
const PHONE_OTP_STEP = 2
const EMAIL_OTP_STEP = 3
const COVERAGE_STEP = 4
const REVIEW_STEP = 5

/**
 * Clerk Core 3 reports failures as a `ClerkError` (`{ code, message }`) returned
 * from the sign-up methods, while older surfaces threw a `ClerkAPIError`
 * (`{ errors: [{ code, message }] }`). Both shapes are read here so the Arabic
 * copy below survives either path.
 */
function clerkErrorMessage(err: unknown): string {
  const error = err as {
    errors?: Array<{ code?: string; message?: string }>
    code?: string
    message?: string
  }
  const map: Record<string, string> = {
    form_identifier_exists:
      'البريد الإلكتروني أو رقم الجوال مستخدم بالفعل. سجّل الدخول أو استخدم بيانات أخرى.',
    form_param_format_invalid: 'صيغة البريد الإلكتروني أو رقم الجوال غير صحيحة.',
    form_password_length_too_short: `كلمة السر قصيرة جدًا (${PASSWORD_MIN_LENGTH} حرفًا على الأقل).`,
    form_password_pwned: 'كلمة السر ضعيفة. اختر كلمة أقوى.',
    verification_invalid: 'الرمز غير صحيح. تحقق من الرمز وحاول مجددًا.',
    verification_expired: 'انتهت صلاحية الرمز. أرسل رمزًا جديدًا.',
  }
  const first = error?.errors?.[0]
  const code = first?.code ?? error?.code
  if (code && map[code]) return map[code]
  return first?.message || error?.message || 'حدث خطأ غير متوقع. حاول مجددًا.'
}

/**
 * `signUp.create()` and friends resolve with `{ error }` instead of rejecting.
 * Re-throwing keeps the surrounding `try/catch` — which already renders
 * `clerkErrorMessage(err)` — as the single error path.
 */
function throwIfClerkError(result: { error: unknown }): void {
  if (result.error) throw result.error
}

/**
 * Sign-up wizard for an applicant with no account yet.
 *
 * Steps 1 and 5 render the *same* components as the signed-in questionnaire
 * (`/become-inspector`), so both intake paths ask identical questions and the
 * two can never drift apart. The only difference is the phone field, which the
 * wizard collects here in its account step instead — see `showPhone`.
 */
export function RegistrationWizard() {
  const { signUp, fetchStatus } = useSignUp()
  // Clerk Core 3's `useSignUp()` exposes no `isLoaded`: the resource stays null
  // until the client resolves, and `fetchStatus` reports an in-flight request.
  const clerkReady = signUp !== null && fetchStatus !== 'fetching'
  const router = useRouter()

  const [step, setStep] = useState(FIRST_INPUT_STEP)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const [draft, setDraft] = useState<InspectorApplicationDraft>(EMPTY_APPLICATION_DRAFT)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [phoneOtp, setPhoneOtp] = useState('')
  const [emailOtp, setEmailOtp] = useState('')

  function patch(next: Partial<InspectorApplicationDraft>) {
    setDraft((current) => ({ ...current, ...next }))
    setError('')
  }

  function toggle(field: 'cities' | 'specialties', value: string) {
    setDraft((current) => {
      const list = current[field]
      return {
        ...current,
        [field]: list.includes(value) ? list.filter((item) => item !== value) : [...list, value],
      }
    })
    setError('')
  }

  // ── step 0 → 1 ─────────────────────────────────────────────────────
  function continueFromIdentity() {
    // The phone is not on this step — the account step collects it.
    const stepError = identityStepError(draftToPayload(draft), { skipPhone: true })
    if (stepError) {
      setError(stepError)
      return
    }
    setError('')
    setStep(ACCOUNT_STEP)
  }

  // ── step 1 → 2 (create the Clerk account, then start phone verification) ──
  async function createAccount() {
    if (!signUp) return
    setError('')

    if (!isValidSaudiMobile(draft.phone)) {
      setError('رقم الجوال غير صحيح. أدخل رقمًا يبدأ بـ 05 ويتكون من 10 أرقام.')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('أدخل بريدًا إلكترونيًا صحيحًا.')
      return
    }
    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(`كلمة السر يجب أن تكون ${PASSWORD_MIN_LENGTH} حرفًا على الأقل.`)
      return
    }

    setLoading(true)
    try {
      const parts = draft.fullName.trim().split(/\s+/)
      const clerkFirstName = parts[0] || draft.fullName.trim()
      const clerkLastName = parts.slice(1).join(' ')

      throwIfClerkError(
        await signUp.create({
          emailAddress: email.trim(),
          phoneNumber: e164Saudi(draft.phone),
          password,
          firstName: clerkFirstName,
          lastName: clerkLastName,
        }),
      )

      if (signUp.status === 'complete') {
        throwIfClerkError(await signUp.finalize())
        setStep(COVERAGE_STEP) // Clerk did not require verification
        return
      }

      throwIfClerkError(await signUp.verifications.sendPhoneCode())
      setStep(PHONE_OTP_STEP)
    } catch (err) {
      setError(clerkErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  // ── step 2 → 3 ─────────────────────────────────────────────────────
  async function verifyPhone() {
    if (!signUp) return
    setError('')
    if (phoneOtp.length < 6) {
      setError('أدخل رمز التحقق المرسل إلى جوالك (6 أرقام).')
      return
    }
    setLoading(true)
    try {
      throwIfClerkError(await signUp.verifications.verifyPhoneCode({ code: phoneOtp }))

      if (signUp.status === 'complete') {
        throwIfClerkError(await signUp.finalize())
        setStep(COVERAGE_STEP)
        return
      }

      throwIfClerkError(await signUp.verifications.sendEmailCode())
      setStep(EMAIL_OTP_STEP)
    } catch (err) {
      setError(clerkErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  // ── step 3 → 4 ─────────────────────────────────────────────────────
  async function verifyEmail() {
    if (!signUp) return
    setError('')
    if (emailOtp.length < 6) {
      setError('أدخل رمز التحقق المرسل إلى بريدك الإلكتروني (6 أرقام).')
      return
    }
    setLoading(true)
    try {
      throwIfClerkError(await signUp.verifications.verifyEmailCode({ code: emailOtp }))

      if (signUp.status === 'complete') {
        throwIfClerkError(await signUp.finalize())
        setStep(COVERAGE_STEP)
        return
      }

      setError('تحقق إضافي مطلوب. تواصل مع الدعم للمساعدة.')
    } catch (err) {
      setError(clerkErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  // ── resend OTP ─────────────────────────────────────────────────────
  async function resendOtp(strategy: 'phone_code' | 'email_code') {
    if (!signUp) return
    setError('')
    setLoading(true)
    try {
      throwIfClerkError(
        strategy === 'phone_code'
          ? await signUp.verifications.sendPhoneCode()
          : await signUp.verifications.sendEmailCode(),
      )
    } catch (err) {
      setError(clerkErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  // ── step 4 → 5 ─────────────────────────────────────────────────────
  function continueFromCoverage() {
    const stepError = coverageStepError(draftToPayload(draft))
    if (stepError) {
      setError(stepError)
      return
    }
    setError('')
    setStep(REVIEW_STEP)
  }

  // ── step 5: submit ─────────────────────────────────────────────────
  async function submitRegistration() {
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/inspectors/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draftToPayload(draft)),
      })
      const data: { error?: string; success?: boolean } = await res.json()
      if (!res.ok) {
        setError(data.error || 'تعذر إرسال الطلب. حاول مرة أخرى.')
        return
      }
      setSubmitted(true)
      router.refresh()
    } catch {
      setError('تعذر الاتصال بالخادم. تحقق من اتصالك ثم حاول مجددًا.')
    } finally {
      setLoading(false)
    }
  }

  // ─── success screen ───────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="mx-auto max-w-xl py-10 text-center">
        <span className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-[#e9f5ff] text-[#0873d1]">
          <BadgeCheck className="size-8" />
        </span>
        <h2 className="mt-6 text-2xl font-black">وصلنا طلبك بنجاح</h2>
        <p className="mt-3 text-sm leading-7 text-[#607087]">
          تم إنشاء حسابك وتوثيقه وإرسال طلب الانضمام كفاحص. سنراجع بياناتك ونتواصل
          معك على رقم الجوال المسجل بعد اكتمال المراجعة.
        </p>
        <p className="mt-5 rounded-xl bg-[#f4f8fc] px-4 py-3 text-sm font-bold text-[#53677e]">
          حالة الطلب: بانتظار المراجعة
        </p>
        <button
          type="button"
          onClick={() => router.push('/')}
          className="mt-6 inline-flex items-center justify-center gap-2 rounded-full bg-[#0b1f46] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#075cae]"
        >
          العودة للرئيسية
          <ArrowLeft className="size-4" />
        </button>
      </div>
    )
  }

  const StepIcon = STEPS[step].icon

  /** Which step a «رجوع» press returns to. OTP steps cannot be re-entered. */
  function backTarget(): number | null {
    if (step === ACCOUNT_STEP) return FIRST_INPUT_STEP
    if (step === COVERAGE_STEP) return EMAIL_OTP_STEP
    if (step === REVIEW_STEP) return COVERAGE_STEP
    return null
  }

  const back = backTarget()

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <span className="inline-flex items-center gap-1.5 text-sm font-bold text-[#0873d1]">
            <StepIcon className="size-4" />
            الخطوة {step + 1} من {STEPS.length}
          </span>
          <h2 className="mt-1 text-xl font-black sm:text-2xl">{STEPS[step].label}</h2>
        </div>
        <span className="shrink-0 rounded-full bg-[#eff7ff] px-4 py-2 text-xs font-bold text-[#075cae]">
          {step + 1}/{STEPS.length}
        </span>
      </div>

      <div
        className="mt-5 h-2 overflow-hidden rounded-full bg-[#eaf0f6]"
        role="progressbar"
        aria-valuenow={step + 1}
        aria-valuemin={1}
        aria-valuemax={STEPS.length}
      >
        <div
          className="h-full rounded-full bg-[#0873d1] transition-all duration-500"
          style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
        />
      </div>

      {step === FIRST_INPUT_STEP && (
        <IdentityStep draft={draft} onChange={patch} showPhone={false} />
      )}

      {/* ─── account credentials ──────────────────────────────────── */}
      {step === ACCOUNT_STEP && (
        <div className="mt-8 space-y-7">
          {signUp === null && <p className="text-sm text-[#78879a]">جارٍ تحميل نموذج التسجيل...</p>}

          <label className="block text-sm font-bold">
            رقم الجوال <span className="text-[#0873d1]">*</span>
            <div className="mt-2 flex items-center gap-2">
              <span className="shrink-0 rounded-xl border border-[#dce4ee] bg-[#f7f9fc] px-3 py-3 text-sm font-bold text-[#52647a]">
                +966
              </span>
              <input
                className={`${fieldClassName} mt-0`}
                dir="ltr"
                inputMode="numeric"
                maxLength={10}
                value={draft.phone}
                onChange={(event) => {
                  let value = event.target.value.replace(/\D/g, '')
                  if (value.startsWith('966')) value = value.slice(3)
                  if (value.startsWith('0')) value = value.slice(1)
                  patch({ phone: value.length > 9 ? value.slice(0, 9) : value })
                }}
                placeholder="05XXXXXXXX"
                autoComplete="tel"
              />
            </div>
            <span className="mt-1 block text-xs font-normal text-[#78879a]">
              سيصلك رمز تحقق عبر SMS لتوثيق الرقم.
            </span>
          </label>

          <label className="block text-sm font-bold">
            البريد الإلكتروني <span className="text-[#0873d1]">*</span>
            <input
              className={fieldClassName}
              dir="ltr"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
            <span className="mt-1 block text-xs font-normal text-[#78879a]">
              سيصلك رمز تحقق عبر البريد لتوثيقه.
            </span>
          </label>

          <label className="block text-sm font-bold">
            كلمة السر <span className="text-[#0873d1]">*</span>
            <div className="relative mt-2">
              <input
                className={fieldClassName}
                dir="ltr"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={`${PASSWORD_MIN_LENGTH} حرفًا على الأقل`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[#78879a] hover:text-[#0b1f46]"
                aria-label={showPassword ? 'إخفاء كلمة السر' : 'إظهار كلمة السر'}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </label>
        </div>
      )}

      {/* ─── phone OTP ────────────────────────────────────────────── */}
      {step === PHONE_OTP_STEP && (
        <div className="mt-8 space-y-6">
          <div className="rounded-xl bg-[#eff7ff] px-4 py-4 text-sm leading-7 text-[#075cae]">
            <Phone className="mb-1 inline size-4" /> أرسلنا رمز تحقق إلى{' '}
            <strong dir="ltr">{e164Saudi(draft.phone)}</strong>. أدخل الرمز أدناه.
          </div>
          <label className="block text-sm font-bold">
            رمز التحقق (SMS)
            <input
              className={`${fieldClassName} text-center text-2xl font-mono tracking-[0.5em]`}
              dir="ltr"
              inputMode="numeric"
              maxLength={6}
              value={phoneOtp}
              onChange={(event) => setPhoneOtp(event.target.value.replace(/\D/g, ''))}
              placeholder="000000"
            />
          </label>
          <button
            type="button"
            onClick={() => resendOtp('phone_code')}
            disabled={loading}
            className="text-xs font-bold text-[#0873d1] hover:underline disabled:opacity-50"
          >
            لم يصلك الرمز؟ أعد الإرسال
          </button>
        </div>
      )}

      {/* ─── email OTP ────────────────────────────────────────────── */}
      {step === EMAIL_OTP_STEP && (
        <div className="mt-8 space-y-6">
          <div className="rounded-xl bg-[#eff7ff] px-4 py-4 text-sm leading-7 text-[#075cae]">
            <Mail className="mb-1 inline size-4" /> أرسلنا رمز تحقق إلى{' '}
            <strong dir="ltr">{email}</strong>. أدخل الرمز أدناه.
          </div>
          <label className="block text-sm font-bold">
            رمز التحقق (البريد)
            <input
              className={`${fieldClassName} text-center text-2xl font-mono tracking-[0.5em]`}
              dir="ltr"
              inputMode="numeric"
              maxLength={6}
              value={emailOtp}
              onChange={(event) => setEmailOtp(event.target.value.replace(/\D/g, ''))}
              placeholder="000000"
            />
          </label>
          <button
            type="button"
            onClick={() => resendOtp('email_code')}
            disabled={loading}
            className="text-xs font-bold text-[#0873d1] hover:underline disabled:opacity-50"
          >
            لم يصلك الرمز؟ أعد الإرسال
          </button>
        </div>
      )}

      {step === COVERAGE_STEP && (
        <CoverageStep draft={draft} onChange={patch} onToggle={toggle} />
      )}

      {step === REVIEW_STEP && <ApplicationReview draft={draft} />}

      {error && (
        <p role="alert" className="mt-5 rounded-xl bg-[#fff1f0] px-4 py-3 text-sm font-semibold text-[#a83c35]">
          {error}
        </p>
      )}

      {/* ─── navigation ───────────────────────────────────────────── */}
      <div className="mt-8 flex flex-col-reverse gap-3 border-t border-[#edf1f5] pt-6 sm:flex-row sm:items-center sm:justify-between">
        {back === null ? (
          <span className="text-xs leading-6 text-[#78879a]">
            الحساب مجاني — لن نشارك بياناتك مع أي طرف ثالث.
          </span>
        ) : (
          <button
            type="button"
            onClick={() => {
              setStep(back)
              setError('')
            }}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-[#dce4ee] px-5 py-3 text-sm font-bold text-[#52647a] hover:bg-[#f7f9fc] disabled:opacity-50"
          >
            <ArrowRight className="size-4" /> رجوع
          </button>
        )}

        {step === FIRST_INPUT_STEP && (
          <button
            type="button"
            onClick={continueFromIdentity}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[#0b1f46] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#075cae]"
          >
            التالي <ArrowLeft className="size-4" />
          </button>
        )}

        {step === ACCOUNT_STEP && (
          <button
            type="button"
            onClick={createAccount}
            disabled={loading || !clerkReady}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[#0b1f46] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#075cae] disabled:cursor-wait disabled:opacity-60"
          >
            {loading ? <LoaderCircle className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
            {loading ? 'جارٍ إنشاء الحساب...' : 'إنشاء الحساب وإرسال الرمز'}
          </button>
        )}

        {step === PHONE_OTP_STEP && (
          <button
            type="button"
            onClick={verifyPhone}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[#0b1f46] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#075cae] disabled:cursor-wait disabled:opacity-60"
          >
            {loading && <LoaderCircle className="size-4 animate-spin" />}
            {loading ? 'جارٍ التحقق...' : 'تحقق من الرمز'}
            {!loading && <ArrowLeft className="size-4" />}
          </button>
        )}

        {step === EMAIL_OTP_STEP && (
          <button
            type="button"
            onClick={verifyEmail}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[#0b1f46] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#075cae] disabled:cursor-wait disabled:opacity-60"
          >
            {loading && <LoaderCircle className="size-4 animate-spin" />}
            {loading ? 'جارٍ التحقق...' : 'تحقق من الرمز'}
            {!loading && <ArrowLeft className="size-4" />}
          </button>
        )}

        {step === COVERAGE_STEP && (
          <button
            type="button"
            onClick={continueFromCoverage}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[#0b1f46] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#075cae]"
          >
            مراجعة الطلب <ArrowLeft className="size-4" />
          </button>
        )}

        {step === REVIEW_STEP && (
          <button
            type="button"
            onClick={submitRegistration}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[#0b1f46] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#075cae] disabled:cursor-wait disabled:opacity-60"
          >
            {loading ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}
            {loading ? 'جارٍ إرسال الطلب...' : 'إرسال طلب الانضمام'}
          </button>
        )}
      </div>
    </div>
  )
}
