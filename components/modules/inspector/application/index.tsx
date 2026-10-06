'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, BadgeCheck, LoaderCircle, Send } from 'lucide-react'
import { notifyNavigationStart } from '@/lib/navigation'
import {
  EMPTY_APPLICATION_DRAFT,
  coverageStepError,
  draftToPayload,
  identityStepError,
  type InspectorApplicationDraft,
} from '@/lib/inspector-application'
import { ApplicationReview } from '@/components/modules/inspector/application/review'
import { CoverageStep } from '@/components/modules/inspector/application/step-coverage'
import { IdentityStep } from '@/components/modules/inspector/application/step-identity'

const STEPS = ['البيانات الأساسية', 'التغطية والتوفر', 'مراجعة وإرسال'] as const

/**
 * The inspector application — two input steps and a read-back.
 *
 * Step boundaries are validated by the same functions the server runs
 * (`identityStepError` / `coverageStepError` in `lib/inspector-application.ts`),
 * so the form can never advance past a step the API would reject. That is the
 * whole reason the rules live in `lib/` rather than inline here.
 */
export function InspectorApplicationForm() {
  const router = useRouter()
  const [draft, setDraft] = useState<InspectorApplicationDraft>(EMPTY_APPLICATION_DRAFT)
  const [step, setStep] = useState(0)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

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

  function goNext() {
    const payload = draftToPayload(draft)
    const stepError = step === 0 ? identityStepError(payload) : coverageStepError(payload)
    if (stepError) {
      setError(stepError)
      return
    }
    setError('')
    setStep((current) => current + 1)
  }

  function goBack() {
    setError('')
    setStep((current) => Math.max(0, current - 1))
  }

  async function submit() {
    setSubmitting(true)
    setError('')
    try {
      const response = await fetch('/api/inspectors/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draftToPayload(draft)),
      })
      const data: { error?: string } = await response.json()

      if (response.status === 401) {
        notifyNavigationStart('/login?next=/become-inspector')
        router.push('/login?next=/become-inspector')
        return
      }
      if (!response.ok) {
        setError(data.error || 'تعذر إرسال الطلب. حاول مرة أخرى.')
        return
      }
      setSubmitted(true)
      router.refresh()
    } catch {
      setError('تعذر الاتصال بالخادم. تحقق من اتصالك ثم حاول مجددًا.')
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <section
        id="application"
        className="scroll-mt-8 rounded-[2rem] border border-[#dce8f4] bg-white p-7 shadow-[0_20px_70px_rgba(11,31,70,.08)] sm:p-10"
      >
        <div className="mx-auto max-w-xl py-8 text-center">
          <span className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-[#e9f5ff] text-[#0873d1]">
            <BadgeCheck className="size-8" />
          </span>
          <h2 className="mt-6 text-2xl font-black">وصلنا طلبك بنجاح</h2>
          <p className="mt-3 text-sm leading-7 text-[#607087]">
            بنراجع بياناتك ونتواصل معك على رقم الجوال اللي أدخلته بعد اكتمال المراجعة.
          </p>
          <p className="mt-5 rounded-xl bg-[#f4f8fc] px-4 py-3 text-sm font-bold text-[#53677e]">
            حالة الطلب: بانتظار المراجعة
          </p>
        </div>
      </section>
    )
  }

  const isReview = step === STEPS.length - 1

  return (
    <section
      id="application"
      className="scroll-mt-8 rounded-[2rem] border border-[#dce8f4] bg-white p-6 shadow-[0_20px_70px_rgba(11,31,70,.08)] sm:p-10"
    >
      <div className="mx-auto max-w-3xl">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-bold text-[#0873d1]">استبيان الانضمام</p>
            <h2 className="mt-2 text-2xl font-black sm:text-3xl">عرّفنا على خبرتك</h2>
            <p className="mt-2 text-sm leading-7 text-[#607087]">
              إجاباتك تساعدنا على مراجعة طلبك وتوجيه الفحوص المناسبة لك.
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-[#eff7ff] px-4 py-2 text-xs font-bold text-[#075cae]">
            {STEPS[step]} · {step + 1}/{STEPS.length}
          </span>
        </div>

        <div
          className="mt-6 h-2 overflow-hidden rounded-full bg-[#eaf0f6]"
          role="progressbar"
          aria-label="تقدم الاستبيان"
          aria-valuemin={1}
          aria-valuemax={STEPS.length}
          aria-valuenow={step + 1}
        >
          <div
            className="h-full rounded-full bg-[#0873d1] transition-all duration-500"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>

        {step === 0 && <IdentityStep draft={draft} onChange={patch} />}
        {step === 1 && <CoverageStep draft={draft} onChange={patch} onToggle={toggle} />}
        {isReview && <ApplicationReview draft={draft} />}

        {error && (
          <p role="alert" className="mt-5 rounded-xl bg-[#fff1f0] px-4 py-3 text-sm font-semibold text-[#a83c35]">
            {error}
          </p>
        )}

        <div className="mt-8 flex flex-col-reverse gap-3 border-t border-[#edf1f5] pt-6 sm:flex-row sm:items-center sm:justify-between">
          {step === 0 ? (
            <span className="text-xs leading-6 text-[#78879a]">
              الإرسال متاح للحسابات المسجل دخولها برقم جوال موثّق.
            </span>
          ) : (
            <button
              type="button"
              onClick={goBack}
              disabled={submitting}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-[#dce4ee] px-5 py-3 text-sm font-bold text-[#52647a] hover:bg-[#f7f9fc] disabled:opacity-50"
            >
              <ArrowRight className="size-4" /> رجوع
            </button>
          )}

          {isReview ? (
            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[#0b1f46] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#075cae] disabled:cursor-wait disabled:opacity-60"
            >
              {submitting ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}
              {submitting ? 'جارٍ إرسال الطلب...' : 'إرسال طلب الانضمام'}
            </button>
          ) : (
            <button
              type="button"
              onClick={goNext}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[#0b1f46] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#075cae]"
            >
              التالي <ArrowLeft className="size-4" />
            </button>
          )}
        </div>
      </div>
    </section>
  )
}
