'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useState, useSyncExternalStore } from 'react'
import confetti from 'canvas-confetti'
import { AnimatePresence, motion } from 'motion/react'
import { toast } from 'sonner'
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Car,
  Check,
  ClipboardList,
  FileSearch,
  LoaderCircle,
  MapPin,
  Palette,
  Route,
  Send,
  ShieldAlert,
  SlidersHorizontal,
  StickyNote,
  Wallet,
} from 'lucide-react'
import { isOperationalCity, saudiCityOptions } from '@/lib/locations/saudi-cities'
import { notifyNavigationStart } from '@/lib/navigation'
import { SaudiPlateInput } from '@/components/ui/saudi-plate-input'
import {
  EMPTY_SAUDI_PLATE,
  isSaudiPlateComplete,
  validateSaudiPlate,
  type SaudiPlateValue,
} from '@/lib/utils/plate-mapper'
import { inspectionTermsVersion, type CreateInspectionPayload } from '@/types/booking'

const steps = ['السيارة', 'الموقع والموعد', 'نوع الفحص', 'التعهد والمراجعة']
const stepIcons = [Car, MapPin, SlidersHorizontal, FileSearch]
const types = ['فحص شامل', 'فحص ميكانيكي', 'فحص هيكل وبوية', 'فحص كمبيوتر']
const typeHints: Record<string, string> = {
  'فحص شامل': 'الأنظمة الأساسية في تقرير واحد',
  'فحص ميكانيكي': 'المحرك وناقل الحركة والتعليق',
  'فحص هيكل وبوية': 'الحوادث والدهان وإصلاحات الهيكل',
  'فحص كمبيوتر': 'قراءة أعطال الكمبيوتر وسجل الصيانة',
}
const localDate = (date: Date) => {
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}
const subscribeToDateSettings = () => () => {}
const getDateSettings = () => {
  const now = new Date()
  return `${localDate(now)}|${now.getFullYear() + 1}`
}
const getServerDateSettings = () => ''

/** `null` when the plate is complete, otherwise the first thing still missing. */
function plateIssue(value: SaudiPlateValue): string | null {
  if (isSaudiPlateComplete(value)) return null
  const issues = validateSaudiPlate(value)
  return issues.numbers ?? issues.lettersEn ?? 'أدخل رقم اللوحة كاملًا (١–٤ أرقام و٣ أحرف).'
}

/** Minimum accepted VIN length — real chassis numbers run to 17 characters. */
const VIN_MIN_LENGTH = 5

export default function NewRequestWizard() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const dateSettings = useSyncExternalStore(subscribeToDateSettings, getDateSettings, getServerDateSettings)
  const [today, maximumYear] = dateSettings ? dateSettings.split('|') : ['', '']
  const [selected, setSelected] = useState<string[]>(['فحص شامل'])
  const [city, setCity] = useState(saudiCityOptions[0]?.name ?? '')
  const [make, setMake] = useState('')
  const [model, setModel] = useState('')
  const [year, setYear] = useState('')
  const [mileage, setMileage] = useState('')
  const [color, setColor] = useState('')
  const [vin, setVin] = useState('')
  const [plate, setPlate] = useState<SaudiPlateValue>({ ...EMPTY_SAUDI_PLATE })
  const [plateError, setPlateError] = useState<string | null>(null)
  const [district, setDistrict] = useState('')
  const [address, setAddress] = useState('')
  const [scheduledDate, setScheduledDate] = useState('')
  const [scheduledTime, setScheduledTime] = useState('')
  const [notes, setNotes] = useState('')
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const toggleType = (type: string) => {
    setSelected((current) => current.includes(type) ? current.filter((item) => item !== type) : [...current, type])
  }

  const handlePlateChange = (next: SaudiPlateValue) => {
    setPlate(next)
    // Once the user has been warned about a half-typed plate, keep the message
    // honest as they fix it instead of leaving a stale error on screen.
    if (plateError !== null) setPlateError(plateIssue(next))
  }

  function canContinue() {
    if (step === 0) {
      if (!make.trim() || !model.trim()) {
        setError('أدخل الشركة والموديل.')
        return false
      }
      const yearNumber = Number(year)
      if (!year || Number.isNaN(yearNumber) || yearNumber < 1950 || yearNumber > new Date().getFullYear() + 1) {
        setError('أدخل سنة صنع صحيحة.')
        return false
      }
      if (!mileage || Number.isNaN(Number(mileage)) || Number(mileage) <= 0 || Number(mileage) > 2_000_000) {
        setError('أدخل الممشى بالكيلومترات (رقم أكبر من صفر).')
        return false
      }
      if (!color.trim()) {
        setError('أدخل لون السيارة.')
        return false
      }
      if (vin.trim().length < VIN_MIN_LENGTH) {
        setError(`أدخل رقم الهيكل (${VIN_MIN_LENGTH} خانات على الأقل).`)
        return false
      }
      // Every field on this step is mandatory — including the plate.
      const issue = plateIssue(plate)
      if (issue) {
        setPlateError(issue)
        return false
      }
      setPlateError(null)
    }
    if (step === 1) {
      const scheduledAt = new Date(`${scheduledDate}T${scheduledTime}`)
      if (!isOperationalCity(city)) {
        setError('التغطية متاحة حاليًا في مدن المنطقة الشرقية فقط.')
        return false
      }
      if (!district.trim() || !address.trim()) {
        setError('أدخل الحي والعنوان لمساعدة الفاحص على الوصول للسيارة.')
        return false
      }
      if (!scheduledDate || !scheduledTime || Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() < Date.now() - 60_000) {
        setError('اختر موعدًا مستقبليًا صالحًا.')
        return false
      }
      if (!notes.trim()) {
        setError('أدخل ملاحظات للفاحص.')
        return false
      }
    }
    if (step === 2 && selected.length === 0) {
      setError('اختر نوع فحص واحدًا على الأقل.')
      return false
    }
    if (step === 3 && !termsAccepted) {
      setError('يجب الموافقة على التعهد قبل نشر الطلب.')
      return false
    }
    setError('')
    return true
  }

  async function publishRequest() {
    if (!canContinue() || saving) return
    setSaving(true)
    setError('')
    try {
      const payload: CreateInspectionPayload = {
        vehicle: {
          make: make.trim(),
          model: model.trim(),
          year: Number(year),
          mileage: mileage ? Number(mileage) : null,
          color: color.trim(),
          vin: vin.trim(),
          plateNumber: plate.fullPlate,
        },
        city,
        district: district.trim(),
        address: address.trim(),
        services: selected,
        scheduledAt: new Date(`${scheduledDate}T${scheduledTime}`).toISOString(),
        notes: notes.trim(),
        termsAccepted: true,
        termsVersion: inspectionTermsVersion,
      }
      const response = await fetch('/api/inspections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data: unknown = await response.json()
      if (!response.ok) {
        const message = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
          ? data.error
          : 'تعذر نشر الطلب. تحقق من البيانات وحاول مجددًا.'
        setError(message)
        return
      }
      toast.success('تم نشر طلب الفحص بنجاح.')
      confetti({
        particleCount: 46,
        spread: 54,
        startVelocity: 27,
        scalar: 0.72,
        origin: { y: 0.78 },
        colors: ['#1d4ed8', '#60a5fa', '#dbeafe'],
        disableForReducedMotion: true,
      })
      notifyNavigationStart('/dashboard?request=created')
      router.push('/dashboard?request=created')
      router.refresh()
    } catch {
      setError('تعذر الاتصال بالخادم. تحقق من اتصالك وحاول مرة أخرى.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="app-page wiz-page">
      <aside className="app-panel wiz-steps-panel" aria-label="خطوات الطلب">
        <div className="app-panel-head">
          <span className="app-panel-icon"><ClipboardList size={20} /></span>
          <div><h2>خطوات الطلب</h2><p>أربع خطوات قصيرة لنشر طلبك.</p></div>
        </div>
        <ol className="wiz-steps">
          {steps.map((item, index) => {
            const state = index < step ? 'is-done' : index === step ? 'is-current' : 'is-next'
            const Icon = stepIcons[index]
            return (
              <li key={item} className={`wiz-step ${state}`} aria-current={index === step ? 'step' : undefined}>
                <span className="wiz-step-dot">{index < step ? <Check size={15} /> : <Icon size={15} />}</span>
                <span className="wiz-step-text"><strong>{item}</strong><small>{index < step ? 'مكتملة' : index === step ? 'الخطوة الحالية' : 'لاحقًا'}</small></span>
              </li>
            )
          })}
        </ol>
      </aside>

      <div className="wiz-main app-page">
        <div className="app-page-head">
          <div>
            <span className="app-eyebrow"><ClipboardList size={14} /> طلب فحص جديد</span>
            <h2>{['بيانات السيارة', 'أين توجد السيارة ومتى يناسبك الفحص؟', 'ما نوع الفحص الذي تحتاجه؟', 'التعهد ومراجعة الطلب'][step]}</h2>
            <p>{[
              'أدخل المعلومات الأساسية للسيارة التي تريد فحصها.',
              'حدد موقع السيارة وموعدًا مناسبًا في نطاق التغطية الحالي.',
              'اختر خدمة فحص واحدة أو أكثر؛ يمكنك الجمع بينها في طلب واحد.',
              'راجع التفاصيل ووافق على التعهد قبل نشر الطلب.',
            ][step]}</p>
          </div>
          <Link href="/dashboard" className="btn btn-ghost btn-sm">حفظ والخروج</Link>
        </div>

        <section className="card wiz-panel">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              {step === 0 && (
                <div className="wiz-form">
                  <div className="wiz-note"><span className="wiz-note-icon"><Car size={20} /></span><p>جميع الحقول إلزامية — تساعد هذه البيانات الفاحص على إعداد تقرير دقيق لسيارتك.</p></div>
                  <div className="wiz-fields is-2">
                    <label className="wiz-field"><span className="wiz-label">الشركة</span><input required maxLength={60} value={make} onChange={(event) => setMake(event.target.value)} placeholder="مثال: تويوتا" /></label>
                    <label className="wiz-field"><span className="wiz-label">الموديل</span><input required maxLength={60} value={model} onChange={(event) => setModel(event.target.value)} placeholder="مثال: كامري" /></label>
                    <label className="wiz-field"><span className="wiz-label">سنة الصنع</span><input required type="number" min="1950" max={maximumYear || undefined} value={year} onChange={(event) => setYear(event.target.value)} placeholder="2021" /></label>
                    <label className="wiz-field"><span className="wiz-label">الممشى (كم)</span><input required type="number" min="1" max="2000000" value={mileage} onChange={(event) => setMileage(event.target.value)} placeholder="مثال: 85000" /></label>
                    <label className="wiz-field"><span className="wiz-label">اللون</span><input required maxLength={40} value={color} onChange={(event) => setColor(event.target.value)} placeholder="أبيض" /></label>
                    <label className="wiz-field"><span className="wiz-label">رقم الهيكل</span><input required dir="ltr" minLength={VIN_MIN_LENGTH} maxLength={40} value={vin} onChange={(event) => setVin(event.target.value)} placeholder="مثال: JTMHV05J204123456" /></label>
                    <div className="wiz-field is-wide">
                      <span className="wiz-label">رقم اللوحة</span>
                      <SaudiPlateInput
                        className="wiz-plate"
                        size="md"
                        value={plate}
                        onChange={handlePlateChange}
                        error={plateError}
                      />
                    </div>
                  </div>
                </div>
              )}

              {step === 1 && (
                <div className="wiz-form">
                  <div className="wiz-fields is-2">
                    <label className="wiz-field"><span className="wiz-label">المدينة أو المحافظة</span>
                      <select value={city} onChange={(event) => setCity(event.target.value)}>
                        <optgroup label="المنطقة الشرقية — متاحة الآن">
                          {saudiCityOptions.filter((option) => option.group === 'eastern-active').map((option) => <option key={option.name} value={option.name}>{option.name}</option>)}
                        </optgroup>
                        {/* Coming-soon cities sit in their own group rather than
                            under "مدن المملكة الأخرى": they are in our region,
                            we just do not dispatch there yet. */}
                        <optgroup label="المنطقة الشرقية — قريبًا">
                          {saudiCityOptions.filter((option) => option.group === 'eastern-soon').map((option) => <option key={option.name} value={option.name} disabled>{option.name} — قريبًا</option>)}
                        </optgroup>
                        <optgroup label="مدن المملكة الأخرى — غير متاحة حاليًا">
                          {saudiCityOptions.filter((option) => option.group === 'other').map((option) => <option key={option.name} value={option.name} disabled>{option.name} — قريبًا</option>)}
                        </optgroup>
                      </select>
                    </label>
                    <label className="wiz-field"><span className="wiz-label">الحي أو المنطقة</span><input required maxLength={80} value={district} onChange={(event) => setDistrict(event.target.value)} placeholder="مثال: الفيصلية" /></label>
                    <label className="wiz-field is-wide"><span className="wiz-label">العنوان أو وصف الموقع</span><input required maxLength={240} value={address} onChange={(event) => setAddress(event.target.value)} placeholder="اسم الشارع أو أقرب معلم واضح" /></label>
                    <label className="wiz-field"><span className="wiz-label">اليوم</span><input required type="date" min={today || undefined} value={scheduledDate} onChange={(event) => setScheduledDate(event.target.value)} /></label>
                    <label className="wiz-field"><span className="wiz-label">الوقت</span><input required type="time" value={scheduledTime} onChange={(event) => setScheduledTime(event.target.value)} /></label>
                  </div>
                  <div className="wiz-note"><span className="wiz-note-icon"><MapPin size={20} /></span><p>الفاحص المعتمد في مدينتك يحتاج العنوان لزيارة السيارة. لا نشارك رقم جوالك ضمن الطلب.</p></div>
                  <label className="wiz-field"><span className="wiz-label">ملاحظات للفاحص</span><textarea required rows={3} maxLength={1000} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="اذكر أي تفاصيل تساعد الفاحص: وصف دقيق لمكان السيارة، أوقات الوصول المناسبة، أو ملاحظات عن حالتها." /></label>
                </div>
              )}

              {step === 2 && (
                <div className="wiz-choices">
                  {types.map((type) => (
                    <button type="button" key={type} onClick={() => toggleType(type)} aria-pressed={selected.includes(type)} className={`wiz-choice ${selected.includes(type) ? 'is-active' : ''}`}>
                      <span className="wiz-choice-check">{selected.includes(type) && <Check size={15} />}</span>
                      <span className="wiz-choice-text"><strong>{type}</strong><small>{typeHints[type]}</small></span>
                    </button>
                  ))}
                </div>
              )}

              {step === 3 && (
                <div className="wiz-form">
                  <div className="wiz-review">
                    <div className="app-panel-head"><span className="app-panel-icon"><FileSearch size={20} /></span><div><h2>ملخص الطلب</h2><p>راجع بيانات السيارة والموقع والخدمة والموعد.</p></div></div>
                    <dl className="wiz-review-list">
                      <div className="wiz-review-row is-wide"><dt><Car size={15} /> السيارة</dt><dd>{make} {model} — موديل {year}</dd></div>
                      <div className="wiz-review-row"><dt>رقم اللوحة</dt><dd dir="ltr">{plate.fullPlate || 'غير محدد'}</dd></div>
                      <div className="wiz-review-row"><dt>رقم الهيكل</dt><dd dir="ltr">{vin.trim() || 'غير محدد'}</dd></div>
                      <div className="wiz-review-row"><dt><Route size={15} /> الممشى</dt><dd>{mileage ? `${mileage} كم` : 'غير محدد'}</dd></div>
                      <div className="wiz-review-row"><dt><Palette size={15} /> اللون</dt><dd>{color || 'غير محدد'}</dd></div>
                      <div className="wiz-review-row is-wide"><dt><MapPin size={15} /> الموقع</dt><dd>{city}، {district} — {address}</dd></div>
                      <div className="wiz-review-row"><dt><SlidersHorizontal size={15} /> نوع الفحص</dt><dd>{selected.join('، ')}</dd></div>
                      <div className="wiz-review-row"><dt><CalendarClock size={15} /> الموعد</dt><dd>{scheduledDate} — {scheduledTime}</dd></div>
                      <div className="wiz-review-row is-wide"><dt><StickyNote size={15} /> ملاحظات للفاحص</dt><dd>{notes.trim() || 'لا توجد ملاحظات'}</dd></div>
                    </dl>
                  </div>
                  <label className="wiz-consent">
                    <input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} />
                    <span><strong>أوافق على التعهد</strong> بأن المعلومات المقدمة صحيحة، وأفهم أن التقرير يوثق المعاينة الظاهرية ولا يمثل ضمانًا لحالة المركبة أو بديلًا عن تقييم مركز صيانة متخصص.</span>
                  </label>
                  <p className="wiz-terms-link"><Link href="/terms">اقرأ الشروط والأحكام</Link></p>
                  <div className="wiz-note is-payment-preview">
                    <span className="wiz-note-icon"><Wallet size={20} /></span>
                    <p><strong>الدفع والضمان التجريبي غير متاحين حاليًا.</strong> لن يتم تحصيل أي مبلغ أو تأكيد عملية دفع عند نشر الطلب.</p>
                  </div>
                  <div className="wiz-note"><span className="wiz-note-icon"><ShieldAlert size={20} /></span><p>سيظهر الطلب للفاحصين المعتمدين في مدن المنطقة الشرقية المتاحة فقط، وتستطيع مقارنة العروض من لوحة العميل.</p></div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </section>

        {error && <p role="alert" className="wiz-error">{error}</p>}
        <div className="wiz-foot">
          <button type="button" disabled={step === 0 || saving} onClick={() => { setError(''); setStep((current) => current - 1) }} className="btn btn-ghost"><ArrowRight size={16} /> السابق</button>
          {step === steps.length - 1
            ? <button type="button" disabled={saving} onClick={publishRequest} className="btn btn-primary">{saving ? <LoaderCircle className="size-4 animate-spin" /> : <Send size={16} />}{saving ? 'جارٍ نشر الطلب' : 'نشر الطلب'}</button>
            : <button type="button" onClick={() => { if (canContinue()) setStep((current) => current + 1) }} className="btn btn-primary">التالي <ArrowLeft size={16} /></button>}
        </div>
      </div>
    </div>
  )
}
