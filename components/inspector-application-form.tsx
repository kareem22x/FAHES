'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, BadgeCheck, Check, LoaderCircle, MapPin, Send } from 'lucide-react'
import { easternProvinceCities } from '@/lib/eastern-province'
import { inspectorAvailabilities, inspectorSpecialties, type InspectorApplicationInput } from '@/lib/types'

const initialAnswers: InspectorApplicationInput = {
  experienceYears: 0,
  cities: [],
  specialties: [],
  qualification: '',
  availability: '',
  hasEquipment: false,
  notes: '',
}

const fieldClassName = 'mt-2 w-full rounded-xl border border-[#dce4ee] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#0873d1] focus:ring-4 focus:ring-[#0873d1]/10'

export function InspectorApplicationForm() {
  const router = useRouter()
  const [answers, setAnswers] = useState(initialAnswers)
  const [step, setStep] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [experienceSelected, setExperienceSelected] = useState(false)
  const [equipmentAnswered, setEquipmentAnswered] = useState(false)
  const [error, setError] = useState('')

  function updateAnswers(patch: Partial<InspectorApplicationInput>) {
    setAnswers((current) => ({ ...current, ...patch }))
    setError('')
  }

  function toggleSelection(field: 'cities' | 'specialties', value: string) {
    const current = answers[field]
    updateAnswers({
      [field]: current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
    })
  }

  function continueToReview() {
    if (!experienceSelected) {
      setError('حدد عدد سنوات الخبرة للمتابعة.')
      return
    }
    if (!answers.specialties.length) {
      setError('اختر مجال خبرتك للمتابعة.')
      return
    }
    setStep(2)
    setError('')
  }

  async function submitApplication() {
    if (!answers.cities.length) {
      setError('اختر مدينة واحدة على الأقل لتغطية الفحص.')
      return
    }
    if (!answers.availability) {
      setError('حدد نوع التوفر المناسب لك.')
      return
    }
    if (!equipmentAnswered) {
      setError('حدد ما إذا كانت معدات الفحص متوفرة لديك.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const response = await fetch('/api/inspectors/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(answers),
      })
      const data: { error?: string; inspectorStatus?: string } = await response.json()
      if (response.status === 401) {
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
      <section id="application" className="scroll-mt-8 rounded-[2rem] border border-[#dce8f4] bg-white p-7 shadow-[0_20px_70px_rgba(11,31,70,.08)] sm:p-10">
        <div className="mx-auto max-w-xl py-8 text-center">
          <span className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-[#e9f5ff] text-[#0873d1]"><BadgeCheck className="size-8" /></span>
          <h2 className="mt-6 text-2xl font-black">وصلنا طلبك بنجاح</h2>
          <p className="mt-3 text-sm leading-7 text-[#607087]">بنراجع إجاباتك ونتواصل معك على رقم الجوال المسجل في حسابك بعد اكتمال المراجعة.</p>
          <p className="mt-5 rounded-xl bg-[#f4f8fc] px-4 py-3 text-sm font-bold text-[#53677e]">حالة الطلب: بانتظار المراجعة</p>
        </div>
      </section>
    )
  }

  return (
    <section id="application" className="scroll-mt-8 rounded-[2rem] border border-[#dce8f4] bg-white p-6 shadow-[0_20px_70px_rgba(11,31,70,.08)] sm:p-10">
      <div className="mx-auto max-w-3xl">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-bold text-[#0873d1]">استبيان الانضمام</p>
            <h2 className="mt-2 text-2xl font-black sm:text-3xl">عرّفنا على خبرتك</h2>
            <p className="mt-2 text-sm leading-7 text-[#607087]">إجاباتك تساعدنا على مراجعة طلبك وتوجيه الفحوص المناسبة لك.</p>
          </div>
          <span className="shrink-0 rounded-full bg-[#eff7ff] px-4 py-2 text-xs font-bold text-[#075cae]">الخطوة {step} من 2</span>
        </div>

        <div className="mt-6 h-2 overflow-hidden rounded-full bg-[#eaf0f6]" role="progressbar" aria-label="تقدم الاستبيان" aria-valuemin={1} aria-valuemax={2} aria-valuenow={step}>
          <div className={`h-full rounded-full bg-[#0873d1] transition-all ${step === 1 ? 'w-1/2' : 'w-full'}`} />
        </div>

        {step === 1 ? (
          <div className="mt-8 space-y-7">
            <label className="block text-sm font-bold">
              كم سنة خبرتك في فحص السيارات؟
              <select
                className={fieldClassName}
                value={experienceSelected ? answers.experienceYears : ''}
                onChange={(event) => {
                  updateAnswers({ experienceYears: Number(event.target.value) })
                  setExperienceSelected(event.target.value !== '')
                }}
              >
                <option value="" disabled>اختر عدد السنوات</option>
                {Array.from({ length: 31 }, (_, years) => <option key={years} value={years}>{years === 0 ? 'أقل من سنة' : `${years} ${years === 1 ? 'سنة' : 'سنوات'}`}</option>)}
                <option value={31}>أكثر من 30 سنة</option>
              </select>
            </label>

            <fieldset>
              <legend className="text-sm font-bold">وش مجالات الفحص اللي تتقنها؟ <span className="text-[#0873d1]">*</span></legend>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {inspectorSpecialties.map((specialty) => {
                  const selected = answers.specialties.includes(specialty)
                  return (
                    <button key={specialty} type="button" aria-pressed={selected} onClick={() => toggleSelection('specialties', specialty)} className={`flex min-h-12 items-center justify-between gap-3 rounded-xl border px-4 py-3 text-right text-sm font-semibold transition ${selected ? 'border-[#0873d1] bg-[#eff7ff] text-[#075cae]' : 'border-[#e4eaf1] bg-white text-[#52647a] hover:border-[#9cc9f1]'}`}>
                      {specialty}
                      {selected && <Check className="size-4 shrink-0" />}
                    </button>
                  )
                })}
              </div>
            </fieldset>

            <label className="block text-sm font-bold">
              شهادات أو دورات ذات صلة <span className="font-normal text-[#78879a]">(اختياري)</span>
              <input className={fieldClassName} maxLength={180} value={answers.qualification} onChange={(event) => updateAnswers({ qualification: event.target.value })} placeholder="مثال: شهادة فحص مركبات أو دورة ميكانيكا" />
            </label>
          </div>
        ) : (
          <div className="mt-8 space-y-7">
            <fieldset>
              <legend className="flex items-center gap-2 text-sm font-bold"><MapPin className="size-4 text-[#0873d1]" /> في أي مدن تقدر تفحص؟ <span className="text-[#0873d1]">*</span></legend>
              <p className="mt-1 text-xs leading-6 text-[#78879a]">اختر كل المدن التي تستطيع الوصول إليها في المنطقة الشرقية.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {easternProvinceCities.map((city) => {
                  const selected = answers.cities.includes(city)
                  return (
                    <button key={city} type="button" aria-pressed={selected} onClick={() => toggleSelection('cities', city)} className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-bold transition ${selected ? 'border-[#0873d1] bg-[#eff7ff] text-[#075cae]' : 'border-[#e4eaf1] bg-white text-[#52647a] hover:border-[#9cc9f1]'}`}>
                      {city}
                      {selected && <Check className="size-3.5" />}
                    </button>
                  )
                })}
              </div>
            </fieldset>

            <fieldset>
              <legend className="text-sm font-bold">وش نوع التوفر المناسب لك؟ <span className="text-[#0873d1]">*</span></legend>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {inspectorAvailabilities.map((availability) => (
                  <label key={availability} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm font-semibold transition ${answers.availability === availability ? 'border-[#0873d1] bg-[#eff7ff] text-[#075cae]' : 'border-[#e4eaf1] text-[#52647a] hover:border-[#9cc9f1]'}`}>
                    <input type="radio" name="availability" value={availability} checked={answers.availability === availability} onChange={() => updateAnswers({ availability })} className="accent-[#0873d1]" />
                    {availability}
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="text-sm font-bold">هل تتوفر لديك معدات الفحص الأساسية؟</legend>
              <div className="mt-3 flex gap-3">
                {[
                  { value: true, label: 'نعم، متوفرة' },
                  { value: false, label: 'لا، أحتاج إلى تجهيزها' },
                ].map((option) => (
                  <label key={option.label} className={`flex flex-1 cursor-pointer items-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold ${answers.hasEquipment === option.value ? 'border-[#0873d1] bg-[#eff7ff] text-[#075cae]' : 'border-[#e4eaf1] text-[#52647a]'}`}>
                    <input type="radio" name="equipment" checked={equipmentAnswered && answers.hasEquipment === option.value} onChange={() => {
                      updateAnswers({ hasEquipment: option.value })
                      setEquipmentAnswered(true)
                    }} className="accent-[#0873d1]" />
                    {option.label}
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="block text-sm font-bold">
              أي معلومات إضافية تحب نعرفها؟ <span className="font-normal text-[#78879a]">(اختياري)</span>
              <textarea className={fieldClassName} rows={4} maxLength={1000} value={answers.notes} onChange={(event) => updateAnswers({ notes: event.target.value })} placeholder="اكتب نبذة مختصرة عن خبرتك أو أي تفاصيل تساعدنا في مراجعة طلبك." />
              <span className="mt-1 block text-left text-xs font-normal text-[#78879a]">{answers.notes.length}/1000</span>
            </label>
          </div>
        )}

        {error && <p role="alert" className="mt-5 rounded-xl bg-[#fff1f0] px-4 py-3 text-sm font-semibold text-[#a83c35]">{error}</p>}
        <div className="mt-8 flex flex-col-reverse gap-3 border-t border-[#edf1f5] pt-6 sm:flex-row sm:items-center sm:justify-between">
          {step === 1 ? (
            <span className="text-xs leading-6 text-[#78879a]">الإرسال متاح للحسابات المسجل دخولها برقم جوال موثّق.</span>
          ) : (
            <button type="button" onClick={() => { setStep(1); setError('') }} className="inline-flex items-center justify-center gap-2 rounded-full border border-[#dce4ee] px-5 py-3 text-sm font-bold text-[#52647a] hover:bg-[#f7f9fc]"><ArrowRight className="size-4" /> رجوع</button>
          )}
          {step === 1 ? (
            <button type="button" onClick={continueToReview} className="inline-flex items-center justify-center gap-2 rounded-full bg-[#0b1f46] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#075cae]">التالي <ArrowLeft className="size-4" /></button>
          ) : (
            <button type="button" onClick={submitApplication} disabled={submitting} className="inline-flex items-center justify-center gap-2 rounded-full bg-[#0b1f46] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#075cae] disabled:cursor-wait disabled:opacity-60">
              {submitting ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}
              {submitting ? 'جارٍ إرسال الطلب...' : 'إرسال طلب الانضمام'}
            </button>
          )}
        </div>
      </div>
    </section>
  )
}
