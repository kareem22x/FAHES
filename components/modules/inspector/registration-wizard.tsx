'use client'

import { useState } from 'react'
import { useSignUp } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Check,
  Eye,
  EyeOff,
  LoaderCircle,
  Mail,
  MapPin,
  Phone,
  Send,
  ShieldCheck,
  User,
} from 'lucide-react'
import { SUPPORTED_CITIES } from '@/lib/locations/saudi-cities'
import { e164Saudi, isValidSaudiMobile } from '@/lib/phone'
import { inspectorAvailabilities, inspectorSpecialties } from '@/types/domain'

const fieldClassName =
  'mt-2 w-full rounded-xl border border-[#dce4ee] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#0873d1] focus:ring-4 focus:ring-[#0873d1]/10'

/**
 * Clerk rejects shorter passwords (`auth_password.min_length = 15` on the linked
 * instance), so the client-side check has to agree with it — otherwise an
 * 8-character password passes the form and comes back as a server-side error.
 */
const PASSWORD_MIN_LENGTH = 15

const WEEKLY_VOLUME_OPTIONS = [
  '1-5 فحوصات',
  '6-10 فحوصات',
  '11-20 فحصًا',
  '21-50 فحصًا',
  'أكثر من 50 فحصًا',
] as const

const STEPS = [
  { label: 'البيانات الشخصية', icon: User },
  { label: 'بيانات الحساب', icon: ShieldCheck },
  { label: 'توثيق الجوال', icon: Phone },
  { label: 'توثيق البريد', icon: Mail },
  { label: 'استبيان الخبرة', icon: BadgeCheck },
  { label: 'مراجعة وإرسال', icon: Send },
] as const

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

export function RegistrationWizard() {
  const { signUp, fetchStatus } = useSignUp()
  // Clerk Core 3's `useSignUp()` exposes no `isLoaded`: the resource stays null
  // until the client resolves, and `fetchStatus` reports an in-flight request.
  const clerkReady = signUp !== null && fetchStatus !== 'fetching'
  const router = useRouter()

  const [step, setStep] = useState(0)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  // --- Step 0: personal info ---
  const [fullName, setFullName] = useState('')
  const [nationalId, setNationalId] = useState('')
  const [workCities, setWorkCities] = useState<string[]>([])

  // --- Step 1: account ---
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  // --- Step 2-3: OTP ---
  const [phoneOtp, setPhoneOtp] = useState('')
  const [emailOtp, setEmailOtp] = useState('')

  // --- Step 4: questionnaire ---
  const [experienceYears, setExperienceYears] = useState(0)
  const [experienceSelected, setExperienceSelected] = useState(false)
  const [specialties, setSpecialties] = useState<string[]>([])
  const [availability, setAvailability] = useState('')
  const [hasEquipment, setHasEquipment] = useState(false)
  const [equipmentAnswered, setEquipmentAnswered] = useState(false)
  const [qualification, setQualification] = useState('')
  const [vehicleTypes, setVehicleTypes] = useState('')
  const [previousWorkYes, setPreviousWorkYes] = useState(false)
  const [previousWorkAnswered, setPreviousWorkAnswered] = useState(false)
  const [previousWorkDetails, setPreviousWorkDetails] = useState('')
  const [weeklyVolume, setWeeklyVolume] = useState('')
  const [tamperingHandling, setTamperingHandling] = useState('')
  const [additionalInfo, setAdditionalInfo] = useState('')

  function toggleCity(city: string) {
    setWorkCities((cur) =>
      cur.includes(city) ? cur.filter((c) => c !== city) : [...cur, city],
    )
    setError('')
  }

  function toggleSpecialty(s: string) {
    setSpecialties((cur) =>
      cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s],
    )
    setError('')
  }

  // --- step 0 → 1 ---
  function validatePersonalInfo(): boolean {
    if (fullName.trim().length < 3) {
      setError('أدخل الاسم الثلاثي الكامل (3 أحرف على الأقل).')
      return false
    }
    if (!/^[12][0-9]{9}$/.test(nationalId)) {
      setError('رقم الهوية يجب أن يكون 10 أرقام ويبدأ بـ 1 (سعودي) أو 2 (مقيم).')
      return false
    }
    if (workCities.length === 0) {
      setError('اختر مدينة عمل واحدة على الأقل.')
      return false
    }
    setError('')
    return true
  }

  // --- step 1 → 2 (create Clerk account + prepare phone OTP) ---
  async function createAccount() {
    if (!signUp) return
    setError('')

    if (!isValidSaudiMobile(phone)) {
      setError('رقم الجوال غير صحيح. أدخل رقمًا يبدأ بـ 05 ويتكون من 10 أرقام.')
      return
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email.trim())) {
      setError('أدخل بريدًا إلكترونيًا صحيحًا.')
      return
    }
    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(`كلمة السر يجب أن تكون ${PASSWORD_MIN_LENGTH} حرفًا على الأقل.`)
      return
    }

    setLoading(true)
    try {
      const parts = fullName.trim().split(/\s+/)
      const clerkFirstName = parts[0] || fullName.trim()
      const clerkLastName = parts.slice(1).join(' ')

      throwIfClerkError(
        await signUp.create({
          emailAddress: email.trim(),
          phoneNumber: e164Saudi(phone),
          password,
          firstName: clerkFirstName,
          lastName: clerkLastName,
        }),
      )

      if (signUp.status === 'complete') {
        throwIfClerkError(await signUp.finalize())
        setStep(4) // skip OTP steps — Clerk didn't require verification
        return
      }

      // send the phone verification code
      throwIfClerkError(await signUp.verifications.sendPhoneCode())
      setStep(2)
    } catch (err) {
      setError(clerkErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  // --- step 2 → 3 (verify phone, prepare email) ---
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
        setStep(4) // email not required — go to questionnaire
        return
      }

      throwIfClerkError(await signUp.verifications.sendEmailCode())
      setStep(3)
    } catch (err) {
      setError(clerkErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  // --- step 3 → 4 (verify email, set active session) ---
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
        setStep(4)
        return
      }

      setError('تحقق إضافي مطلوب. تواصل مع الدعم للمساعدة.')
    } catch (err) {
      setError(clerkErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  // --- resend OTP ---
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

  // --- step 4 validation ---
  function validateQuestionnaire(): boolean {
    if (!experienceSelected) {
      setError('حدد عدد سنوات الخبرة.')
      return false
    }
    if (specialties.length === 0) {
      setError('اختر مجال خبرة واحدًا على الأقل.')
      return false
    }
    if (!availability) {
      setError('حدد نوع التفرغ.')
      return false
    }
    if (!equipmentAnswered) {
      setError('حدد ما إذا كانت معدات الفحص متوفرة.')
      return false
    }
    if (!previousWorkAnswered) {
      setError('أجب على سؤال العمل السابق.')
      return false
    }
    if (!weeklyVolume) {
      setError('حدد حجم العمل الأسبوعي.')
      return false
    }
    setError('')
    return true
  }

  // --- step 5: submit everything ---
  async function submitRegistration() {
    setError('')
    setLoading(true)
    try {
      const previousWork = previousWorkAnswered
        ? previousWorkYes
          ? `نعم${previousWorkDetails.trim() ? ': ' + previousWorkDetails.trim() : ''}`
          : 'لا'
        : ''

      const res = await fetch('/api/inspectors/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nationalId: nationalId.trim(),
          fullName: fullName.trim(),
          workCities,
          experienceYears,
          specialties,
          availability,
          hasEquipment,
          qualification: qualification.trim(),
          vehicleTypes: vehicleTypes.trim(),
          previousWork,
          weeklyVolume,
          tamperingHandling: tamperingHandling.trim(),
          additionalInfo: additionalInfo.trim(),
        }),
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

  // ─── success screen ─────────────────────────────────────────────
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

  // ─── header + progress ──────────────────────────────────────────
  const StepIcon = STEPS[step].icon

  return (
    <div>
      {/* heading */}
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

      {/* progress bar */}
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

      {/* ─── step 0: personal info ─────────────────────────────── */}
      {step === 0 && (
        <div className="mt-8 space-y-7">
          <label className="block text-sm font-bold">
            الاسم الثلاثي الكامل
            <input
              className={fieldClassName}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="مثال: محمد عبدالله القحطاني"
              maxLength={80}
            />
          </label>

          <label className="block text-sm font-bold">
            رقم الهوية الوطنية
            <input
              className={`${fieldClassName} text-center font-mono tracking-[0.2em]`}
              dir="ltr"
              inputMode="numeric"
              maxLength={10}
              value={nationalId}
              onChange={(e) => setNationalId(e.target.value.replace(/\D/g, ''))}
              placeholder="1XXXXXXXXX"
            />
            <span className="mt-1 block text-xs font-normal text-[#78879a]">
              10 أرقام — يبدأ بـ 1 للسعوديين أو 2 للمقيمين.
            </span>
          </label>

          <fieldset>
            <legend className="flex items-center gap-2 text-sm font-bold">
              <MapPin className="size-4 text-[#0873d1]" /> مكان العمل
            </legend>
            <p className="mt-1 text-xs leading-6 text-[#78879a]">
              اختر المدن التي تقدر تفحص فيها. العمل متاح حاليًا في مدن المنطقة الشرقية.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {SUPPORTED_CITIES.map((city) => {
                const selected = workCities.includes(city)
                return (
                  <button
                    key={city}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleCity(city)}
                    className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-bold transition ${
                      selected
                        ? 'border-[#0873d1] bg-[#eff7ff] text-[#075cae]'
                        : 'border-[#e4eaf1] bg-white text-[#52647a] hover:border-[#9cc9f1]'
                    }`}
                  >
                    {city}
                    {selected && <Check className="size-3.5" />}
                  </button>
                )
              })}
            </div>
          </fieldset>
        </div>
      )}

      {/* ─── step 1: account credentials ────────────────────────── */}
      {step === 1 && (
        <div className="mt-8 space-y-7">
          {signUp === null && (
            <p className="text-sm text-[#78879a]">جارٍ تحميل نموذج التسجيل...</p>
          )}

          <label className="block text-sm font-bold">
            رقم الجوال
            <div className="mt-2 flex items-center gap-2">
              <span className="shrink-0 rounded-xl border border-[#dce4ee] bg-[#f7f9fc] px-3 py-3 text-sm font-bold text-[#52647a]">
                +966
              </span>
              <input
                className={fieldClassName}
                dir="ltr"
                inputMode="numeric"
                maxLength={10}
                value={phone ? '0' + phone : ''}
                onChange={(e) => {
                  let val = e.target.value.replace(/\D/g, '')
                  if (val.startsWith('966')) val = val.slice(3)
                  if (val.startsWith('0')) val = val.slice(1)
                  if (val.length > 9) val = val.slice(0, 9)
                  setPhone(val)
                }}
                placeholder="05XXXXXXXX"
              />
            </div>
            <span className="mt-1 block text-xs font-normal text-[#78879a]">
              سيصلك رمز تحقق عبر SMS لتوثيق الرقم.
            </span>
          </label>

          <label className="block text-sm font-bold">
            البريد الإلكتروني
            <input
              className={fieldClassName}
              dir="ltr"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
            <span className="mt-1 block text-xs font-normal text-[#78879a]">
              سيصلك رمز تحقق عبر البريد لتوثيقه.
            </span>
          </label>

          <label className="block text-sm font-bold">
            كلمة السر
            <div className="relative mt-2">
              <input
                className={fieldClassName}
                dir="ltr"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={`${PASSWORD_MIN_LENGTH} حرفًا على الأقل`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[#78879a] hover:text-[#0b1f46]"
                aria-label={showPassword ? 'إخفاء كلمة السر' : 'إظهار كلمة السر'}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </label>
        </div>
      )}

      {/* ─── step 2: phone OTP ───────────────────────────────────── */}
      {step === 2 && (
        <div className="mt-8 space-y-6">
          <div className="rounded-xl bg-[#eff7ff] px-4 py-4 text-sm leading-7 text-[#075cae]">
            <Phone className="mb-1 inline size-4" /> أرسلنا رمز تحقق إلى{' '}
            <strong dir="ltr">+966{phone}</strong>. أدخل الرمز أدناه.
          </div>
          <label className="block text-sm font-bold">
            رمز التحقق (SMS)
            <input
              className={`${fieldClassName} text-center text-2xl tracking-[0.5em] font-mono`}
              dir="ltr"
              inputMode="numeric"
              maxLength={6}
              value={phoneOtp}
              onChange={(e) => setPhoneOtp(e.target.value.replace(/\D/g, ''))}
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

      {/* ─── step 3: email OTP ───────────────────────────────────── */}
      {step === 3 && (
        <div className="mt-8 space-y-6">
          <div className="rounded-xl bg-[#eff7ff] px-4 py-4 text-sm leading-7 text-[#075cae]">
            <Mail className="mb-1 inline size-4" /> أرسلنا رمز تحقق إلى{' '}
            <strong dir="ltr">{email}</strong>. أدخل الرمز أدناه.
          </div>
          <label className="block text-sm font-bold">
            رمز التحقق (البريد)
            <input
              className={`${fieldClassName} text-center text-2xl tracking-[0.5em] font-mono`}
              dir="ltr"
              inputMode="numeric"
              maxLength={6}
              value={emailOtp}
              onChange={(e) => setEmailOtp(e.target.value.replace(/\D/g, ''))}
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

      {/* ─── step 4: experience questionnaire (10 questions) ────── */}
      {step === 4 && (
        <div className="mt-8 space-y-7">
          {/* Q1 */}
          <label className="block text-sm font-bold">
            1. كم سنة خبرتك في فحص السيارات؟
            <select
              className={fieldClassName}
              value={experienceSelected ? experienceYears : ''}
              onChange={(e) => {
                setExperienceYears(Number(e.target.value))
                setExperienceSelected(e.target.value !== '')
              }}
            >
              <option value="" disabled>
                اختر عدد السنوات
              </option>
              {Array.from({ length: 31 }, (_, y) => (
                <option key={y} value={y}>
                  {y === 0 ? 'أقل من سنة' : `${y} ${y === 1 ? 'سنة' : y <= 10 ? 'سنوات' : 'سنة'}`}
                </option>
              ))}
              <option value={31}>أكثر من 30 سنة</option>
            </select>
          </label>

          {/* Q2 */}
          <fieldset>
            <legend className="text-sm font-bold">
              2. ما مجالات الفحص التي تتقنها؟{' '}
              <span className="text-[#0873d1]">*</span>
            </legend>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {inspectorSpecialties.map((s) => {
                const selected = specialties.includes(s)
                return (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleSpecialty(s)}
                    className={`flex min-h-12 items-center justify-between gap-3 rounded-xl border px-4 py-3 text-right text-sm font-semibold transition ${
                      selected
                        ? 'border-[#0873d1] bg-[#eff7ff] text-[#075cae]'
                        : 'border-[#e4eaf1] bg-white text-[#52647a] hover:border-[#9cc9f1]'
                    }`}
                  >
                    {s}
                    {selected && <Check className="size-4 shrink-0" />}
                  </button>
                )
              })}
            </div>
          </fieldset>

          {/* Q3 */}
          <fieldset>
            <legend className="text-sm font-bold">
              3. ما نوع التفرغ المتاح لك؟ <span className="text-[#0873d1]">*</span>
            </legend>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {inspectorAvailabilities.map((a) => (
                <label
                  key={a}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm font-semibold transition ${
                    availability === a
                      ? 'border-[#0873d1] bg-[#eff7ff] text-[#075cae]'
                      : 'border-[#e4eaf1] text-[#52647a] hover:border-[#9cc9f1]'
                  }`}
                >
                  <input
                    type="radio"
                    name="availability"
                    value={a}
                    checked={availability === a}
                    onChange={() => setAvailability(a)}
                    className="accent-[#0873d1]"
                  />
                  {a}
                </label>
              ))}
            </div>
          </fieldset>

          {/* Q4 */}
          <fieldset>
            <legend className="text-sm font-bold">
              4. هل تتوفر لديك معدات الفحص الأساسية؟{' '}
              <span className="text-[#0873d1]">*</span>
            </legend>
            <div className="mt-3 flex gap-3">
              {[
                { value: true, label: 'نعم، متوفرة' },
                { value: false, label: 'لا، أحتاج تجهيزها' },
              ].map((opt) => (
                <label
                  key={opt.label}
                  className={`flex flex-1 cursor-pointer items-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold ${
                    equipmentAnswered && hasEquipment === opt.value
                      ? 'border-[#0873d1] bg-[#eff7ff] text-[#075cae]'
                      : 'border-[#e4eaf1] text-[#52647a]'
                  }`}
                >
                  <input
                    type="radio"
                    name="equipment"
                    checked={equipmentAnswered && hasEquipment === opt.value}
                    onChange={() => {
                      setHasEquipment(opt.value)
                      setEquipmentAnswered(true)
                    }}
                    className="accent-[#0873d1]"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </fieldset>

          {/* Q5 */}
          <label className="block text-sm font-bold">
            5. ما الشهادات أو الدورات ذات الصلة التي تحملها؟{' '}
            <span className="font-normal text-[#78879a]">(اختياري)</span>
            <input
              className={fieldClassName}
              maxLength={180}
              value={qualification}
              onChange={(e) => setQualification(e.target.value)}
              placeholder="مثال: شهادة فحص مركبات أو دورة ميكانيكا"
            />
          </label>

          {/* Q6 */}
          <label className="block text-sm font-bold">
            6. ما أنواع السيارات التي لديك خبرة في فحصها؟{' '}
            <span className="font-normal text-[#78879a]">(اختياري)</span>
            <input
              className={fieldClassName}
              maxLength={200}
              value={vehicleTypes}
              onChange={(e) => setVehicleTypes(e.target.value)}
              placeholder="مثال: يابانية، ألمانية، دفع رباعي، كهربائية"
            />
          </label>

          {/* Q7 */}
          <fieldset>
            <legend className="text-sm font-bold">
              7. هل سبق لك العمل في مركز فحص معتمد أو ورشة؟{' '}
              <span className="text-[#0873d1]">*</span>
            </legend>
            <div className="mt-3 flex gap-3">
              {[
                { value: true, label: 'نعم' },
                { value: false, label: 'لا' },
              ].map((opt) => (
                <label
                  key={opt.label}
                  className={`flex flex-1 cursor-pointer items-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold ${
                    previousWorkAnswered && previousWorkYes === opt.value
                      ? 'border-[#0873d1] bg-[#eff7ff] text-[#075cae]'
                      : 'border-[#e4eaf1] text-[#52647a]'
                  }`}
                >
                  <input
                    type="radio"
                    name="previousWork"
                    checked={previousWorkAnswered && previousWorkYes === opt.value}
                    onChange={() => {
                      setPreviousWorkYes(opt.value)
                      setPreviousWorkAnswered(true)
                    }}
                    className="accent-[#0873d1]"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
            {previousWorkAnswered && previousWorkYes && (
              <input
                className={`${fieldClassName} mt-3`}
                maxLength={300}
                value={previousWorkDetails}
                onChange={(e) => setPreviousWorkDetails(e.target.value)}
                placeholder="اذكر اسم المركز/الورشة ومدة العمل"
              />
            )}
          </fieldset>

          {/* Q8 */}
          <label className="block text-sm font-bold">
            8. كم فحصًا تنجز تقريبًا في الأسبوع؟{' '}
            <span className="text-[#0873d1]">*</span>
            <select
              className={fieldClassName}
              value={weeklyVolume}
              onChange={(e) => setWeeklyVolume(e.target.value)}
            >
              <option value="" disabled>
                اختر الحجم
              </option>
              {WEEKLY_VOLUME_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>

          {/* Q9 */}
          <label className="block text-sm font-bold">
            9. كيف تتعامل مع علامات تلاعب العداد أو الأضرار الخفية؟{' '}
            <span className="font-normal text-[#78879a]">(اختياري)</span>
            <textarea
              className={fieldClassName}
              rows={3}
              maxLength={400}
              value={tamperingHandling}
              onChange={(e) => setTamperingHandling(e.target.value)}
              placeholder="صف بإيجاز منهجية الكشف عن التلاعب والأضرار الخفية..."
            />
          </label>

          {/* Q10 */}
          <label className="block text-sm font-bold">
            10. أي معلومات إضافية تحب أن تخبرنا بها عن خبرتك؟{' '}
            <span className="font-normal text-[#78879a]">(اختياري)</span>
            <textarea
              className={fieldClassName}
              rows={3}
              maxLength={400}
              value={additionalInfo}
              onChange={(e) => setAdditionalInfo(e.target.value)}
              placeholder="نبذة مختصرة عن خبرتك أو أي تفاصيل تساعدنا في مراجعة طلبك."
            />
          </label>
        </div>
      )}

      {/* ─── step 5: review ──────────────────────────────────────── */}
      {step === 5 && (
        <div className="mt-8 space-y-5">
          <div className="rounded-xl border border-[#dce8f4] bg-[#f7f9fc] p-5 text-sm">
            <h3 className="font-black text-[#0b1f46]">البيانات الشخصية</h3>
            <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <dt className="text-[#78879a]">الاسم</dt>
                <dd className="font-semibold">{fullName}</dd>
              </div>
              <div>
                <dt className="text-[#78879a]">رقم الهوية</dt>
                <dd className="font-semibold" dir="ltr">
                  {nationalId}
                </dd>
              </div>
              <div>
                <dt className="text-[#78879a]">مكان العمل</dt>
                <dd className="font-semibold">{workCities.join('، ')}</dd>
              </div>
              <div>
                <dt className="text-[#78879a]">الجوال</dt>
                <dd className="font-semibold" dir="ltr">
                  +966{phone}
                </dd>
              </div>
              <div>
                <dt className="text-[#78879a]">البريد</dt>
                <dd className="font-semibold" dir="ltr">
                  {email}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-xl border border-[#dce8f4] bg-[#f7f9fc] p-5 text-sm">
            <h3 className="font-black text-[#0b1f46]">ملخص الاستبيان</h3>
            <dl className="mt-3 space-y-2">
              <div>
                <dt className="text-[#78879a]">سنوات الخبرة</dt>
                <dd className="font-semibold">
                  {experienceYears === 31 ? 'أكثر من 30 سنة' : experienceYears === 0 ? 'أقل من سنة' : `${experienceYears}`}
                </dd>
              </div>
              <div>
                <dt className="text-[#78879a]">المجالات</dt>
                <dd className="font-semibold">{specialties.join('، ')}</dd>
              </div>
              <div>
                <dt className="text-[#78879a]">التفرغ</dt>
                <dd className="font-semibold">{availability}</dd>
              </div>
              <div>
                <dt className="text-[#78879a]">المعدات</dt>
                <dd className="font-semibold">{hasEquipment ? 'نعم' : 'لا'}</dd>
              </div>
              <div>
                <dt className="text-[#78879a]">الحجم الأسبوعي</dt>
                <dd className="font-semibold">{weeklyVolume}</dd>
              </div>
            </dl>
          </div>

          <p className="text-xs leading-6 text-[#78879a]">
            بالضغط على «إرسال طلب الانضمام» أنت توافق على مراجعة بياناتك وتفعيل
            حسابك كفاحص بعد الموافقة.
          </p>
        </div>
      )}

      {/* ─── error ────────────────────────────────────────────────── */}
      {error && (
        <p
          role="alert"
          className="mt-5 rounded-xl bg-[#fff1f0] px-4 py-3 text-sm font-semibold text-[#a83c35]"
        >
          {error}
        </p>
      )}

      {/* ─── navigation ──────────────────────────────────────────── */}
      <div className="mt-8 flex flex-col-reverse gap-3 border-t border-[#edf1f5] pt-6 sm:flex-row sm:items-center sm:justify-between">
        {/* back button */}
        {step > 0 && step < 4 ? (
          <button
            type="button"
            onClick={() => {
              setStep((s) => s - 1)
              setError('')
            }}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-[#dce4ee] px-5 py-3 text-sm font-bold text-[#52647a] hover:bg-[#f7f9fc] disabled:opacity-50"
          >
            <ArrowRight className="size-4" /> رجوع
          </button>
        ) : step === 4 ? (
          <button
            type="button"
            onClick={() => {
              setStep(3)
              setError('')
            }}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-[#dce4ee] px-5 py-3 text-sm font-bold text-[#52647a] hover:bg-[#f7f9fc] disabled:opacity-50"
          >
            <ArrowRight className="size-4" /> رجوع
          </button>
        ) : step === 5 ? (
          <button
            type="button"
            onClick={() => {
              setStep(4)
              setError('')
            }}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-[#dce4ee] px-5 py-3 text-sm font-bold text-[#52647a] hover:bg-[#f7f9fc] disabled:opacity-50"
          >
            <ArrowRight className="size-4" /> رجوع
          </button>
        ) : (
          <span className="text-xs leading-6 text-[#78879a]">
            الحساب مجاني — لن نشارك بياناتك مع أي طرف ثالث.
          </span>
        )}

        {/* forward button */}
        {step === 0 && (
          <button
            type="button"
            onClick={() => {
              if (validatePersonalInfo()) setStep(1)
            }}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[#0b1f46] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#075cae]"
          >
            التالي
            <ArrowLeft className="size-4" />
          </button>
        )}

        {step === 1 && (
          <button
            type="button"
            onClick={createAccount}
            disabled={loading || !clerkReady}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[#0b1f46] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#075cae] disabled:cursor-wait disabled:opacity-60"
          >
            {loading ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <ShieldCheck className="size-4" />
            )}
            {loading ? 'جارٍ إنشاء الحساب...' : 'إنشاء الحساب وإرسال الرمز'}
          </button>
        )}

        {step === 2 && (
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

        {step === 3 && (
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

        {step === 4 && (
          <button
            type="button"
            onClick={() => {
              if (validateQuestionnaire()) setStep(5)
            }}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[#0b1f46] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#075cae]"
          >
            مراجعة الطلب
            <ArrowLeft className="size-4" />
          </button>
        )}

        {step === 5 && (
          <button
            type="button"
            onClick={submitRegistration}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[#0b1f46] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#075cae] disabled:cursor-wait disabled:opacity-60"
          >
            {loading ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            {loading ? 'جارٍ إرسال الطلب...' : 'إرسال طلب الانضمام'}
          </button>
        )}
      </div>
    </div>
  )
}
