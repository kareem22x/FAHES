'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useSyncExternalStore } from 'react'
import SiteHeader from '@/components/site-header'
import { ArrowLeft, ArrowRight, CalendarClock, Car, Check, ClipboardList, FileSearch, LoaderCircle, LogOut, MapPin, Palette, Route, ShieldAlert, SlidersHorizontal, StickyNote, Wallet } from 'lucide-react'
import { easternProvinceCities } from '@/lib/eastern-province'
import '@/app/requests-new.css'

const steps = ['السيارة', 'الموقع', 'نوع الفحص', 'الموعد', 'المراجعة']
const stepIcons = [Car, MapPin, SlidersHorizontal, CalendarClock, FileSearch]
const stepHints = ['بيانات المركبة', 'عنوان الفحص', 'خدمة أو أكثر', 'اليوم والوقت', 'قبل النشر']
const types = ['فحص شامل', 'فحص ميكانيكي', 'فحص هيكل وبوية', 'فحص كمبيوتر']
const typeHints: Record<string, string> = {
  'فحص شامل': 'كل الأنظمة الأساسية في تقرير واحد',
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

export default function NewRequestPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const dateSettings = useSyncExternalStore(subscribeToDateSettings, getDateSettings, getServerDateSettings)
  const [today, maximumYear] = dateSettings ? dateSettings.split('|') : ['', '']
  const [selected, setSelected] = useState<string[]>(['فحص شامل'])
  const [city, setCity] = useState(easternProvinceCities[0])
  const [make, setMake] = useState('')
  const [model, setModel] = useState('')
  const [year, setYear] = useState('')
  const [mileage, setMileage] = useState('')
  const [color, setColor] = useState('')
  const [district, setDistrict] = useState('')
  const [address, setAddress] = useState('')
  const [scheduledDate, setScheduledDate] = useState('')
  const [scheduledTime, setScheduledTime] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const toggleType = (type: string) => {
    setSelected((current) => current.includes(type) ? current.filter((item) => item !== type) : [...current, type])
  }

  function canContinue() {
    if (step === 0 && (!make.trim() || !model.trim() || !year || Number(year) < 1950 || Number(year) > new Date().getFullYear() + 1)) {
      setError('أدخل الشركة والموديل وسنة صنع صحيحة.')
      return false
    }
    if (step === 1 && (!district.trim() || !address.trim())) {
      setError('أدخل الحي والعنوان لمساعدة الفاحص على الوصول للسيارة.')
      return false
    }
    if (step === 2 && selected.length === 0) {
      setError('اختر نوع فحص واحدًا على الأقل.')
      return false
    }
    if (step === 3) {
      const scheduledAt = new Date(`${scheduledDate}T${scheduledTime}`)
      if (!scheduledDate || !scheduledTime || Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() < Date.now() - 60_000) {
        setError('اختر موعدًا مستقبليًا صالحًا.')
        return false
      }
    }
    setError('')
    return true
  }

  async function publishRequest() {
    setSaving(true)
    setError('')
    try {
      const response = await fetch('/api/inspections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicle: {
            make: make.trim(),
            model: model.trim(),
            year: Number(year),
            mileage: mileage ? Number(mileage) : null,
            color: color.trim(),
          },
          city,
          district: district.trim(),
          address: address.trim(),
          services: selected,
          scheduledAt: new Date(`${scheduledDate}T${scheduledTime}`).toISOString(),
          notes: notes.trim(),
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        setError(typeof data.error === 'string' ? data.error : 'تعذر نشر الطلب. تحقق من البيانات وحاول مجددًا.')
        return
      }
      router.push('/dashboard?request=created')
      router.refresh()
    } catch {
      setError('تعذر الاتصال بالخادم. تحقق من اتصالك وحاول مرة أخرى.')
    } finally {
      setSaving(false)
    }
  }

  return <div className="app-shell">
    <SiteHeader navigation={[]} compact ctaLabel="طلباتي" ctaHref="/dashboard" />
    <main dir="rtl" className="app-main">
      <div className="app-content">
        <div className="app-page wiz-page">
          <aside className="app-panel wiz-steps-panel" aria-label="خطوات الطلب">
            <div className="app-panel-head">
              <span className="app-panel-icon"><ClipboardList size={20} /></span>
              <div><h2>خطوات الطلب</h2><p>05 خطوات قصيرة وينشر طلبك.</p></div>
            </div>
            <ol className="wiz-steps">
              {steps.map((item, index) => {
                const state = index < step ? 'is-done' : index === step ? 'is-current' : 'is-next'
                const Icon = stepIcons[index]
                return <li key={item} className={`wiz-step ${state}`} aria-current={index === step ? 'step' : undefined}>
                  <span className="wiz-step-dot">{index < step ? <Check size={15} /> : <Icon size={15} />}</span>
                  <span className="wiz-step-text"><strong>{item}</strong><small>{index < step ? 'مكتملة' : index === step ? 'الخطوة الحالية' : 'لاحقًا'}</small></span>
                </li>
              })}
            </ol>
          </aside>

          <div className="wiz-main app-page">
            <div className="app-page-head">
              <div>
                <span className="app-eyebrow"><ClipboardList size={14} /> طلب فحص جديد</span>
                <h2>{['بيانات السيارة', 'أين توجد السيارة؟', 'ما نوع الفحص الذي تحتاجه؟', 'متى يناسبك الفحص؟', 'راجع طلبك قبل النشر'][step]}</h2>
                <p>{step === 0 ? 'أدخل المعلومات الأساسية للسيارة التي تريد فحصها.' : step === 1 ? 'حدد موقع السيارة في المنطقة الشرقية؛ ما يحتاج تكون قريب منها.' : step === 2 ? 'اختر خدمة فحص واحدة أو أكثر؛ يمكنك الجمع بينها في طلب واحد.' : step === 3 ? 'اختر اليوم والوقت المناسبين لزيارة الفاحص.' : 'يمكنك مراجعة التفاصيل قبل نشر الطلب للفاحصين.'}</p>
              </div>
              <Link href="/dashboard" className="btn btn-ghost btn-sm"><LogOut size={15} /> حفظ والخروج</Link>
            </div>
            <section className="card wiz-panel">
                {step === 0 && <div className="wiz-fields is-2">
                  <label className="wiz-field"><span className="wiz-label">الشركة</span><input required maxLength={60} value={make} onChange={(event) => setMake(event.target.value)} placeholder="مثال: تويوتا" /></label>
                  <label className="wiz-field"><span className="wiz-label">الموديل</span><input required maxLength={60} value={model} onChange={(event) => setModel(event.target.value)} placeholder="مثال: كامري" /></label>
                  <label className="wiz-field"><span className="wiz-label">سنة الصنع</span><input required type="number" min="1950" max={maximumYear || undefined} value={year} onChange={(event) => setYear(event.target.value)} placeholder="2021" /></label>
                  <label className="wiz-field"><span className="wiz-label">الممشى <span className="wiz-hint">اختياري</span></span><input type="number" min="0" max="2000000" value={mileage} onChange={(event) => setMileage(event.target.value)} placeholder="مثال: 85000 كم" /></label>
                  <label className="wiz-field is-wide"><span className="wiz-label">اللون <span className="wiz-hint">اختياري</span></span><input maxLength={40} value={color} onChange={(event) => setColor(event.target.value)} placeholder="أبيض" /></label>
                </div>}

                {step === 1 && <div className="wiz-form">
                  <div className="wiz-fields">
                    <label className="wiz-field"><span className="wiz-label">المدينة أو المحافظة</span><select value={city} onChange={(event) => setCity(event.target.value)}>{easternProvinceCities.map((cityName) => <option key={cityName}>{cityName}</option>)}</select></label>
                    <label className="wiz-field"><span className="wiz-label">الحي أو المنطقة</span><input required maxLength={80} value={district} onChange={(event) => setDistrict(event.target.value)} placeholder="مثال: الفيصلية" /></label>
                    <label className="wiz-field"><span className="wiz-label">العنوان أو وصف الموقع</span><input required maxLength={240} value={address} onChange={(event) => setAddress(event.target.value)} placeholder="اسم الشارع أو أقرب معلم واضح" /></label>
                  </div>
                  <div className="wiz-note">
                    <span className="wiz-note-icon"><MapPin size={20} /></span>
                    <p>الفاحص المعتمد في مدينتك يحتاج العنوان لزيارة السيارة. لا نشارك رقم جوالك ضمن الطلب.</p>
                  </div>
                </div>}

                {step === 2 && <div className="wiz-choices">{types.map((type) => <button type="button" key={type} onClick={() => toggleType(type)} aria-pressed={selected.includes(type)} className={`wiz-choice ${selected.includes(type) ? 'is-active' : ''}`}><span className="wiz-choice-check">{selected.includes(type) && <Check size={15} />}</span><span className="wiz-choice-text"><strong>{type}</strong><small>{typeHints[type]}</small></span></button>)}</div>}

                {step === 3 && <div className="wiz-fields is-2">
                  <label className="wiz-field"><span className="wiz-label">اليوم</span><input required type="date" min={today || undefined} value={scheduledDate} onChange={(event) => setScheduledDate(event.target.value)} /></label>
                  <label className="wiz-field"><span className="wiz-label">الوقت</span><input required type="time" value={scheduledTime} onChange={(event) => setScheduledTime(event.target.value)} /></label>
                  <label className="wiz-field is-wide"><span className="wiz-label">ملاحظات إضافية <span className="wiz-hint">اختياري</span></span><textarea rows={4} maxLength={1000} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="أي تفاصيل تساعد الفاحص" /></label>
                </div>}

                {step === 4 && <div className="wiz-form">
                  <div className="wiz-review">
                    <div className="app-panel-head">
                      <span className="app-panel-icon"><FileSearch size={20} /></span>
                      <div><h2>ملخص الطلب</h2><p>هذه البيانات التي ستُرسل إلى الفاحصين المعتمدين.</p></div>
                    </div>
                    <dl className="wiz-review-list">
                      <div className="wiz-review-row is-wide"><dt><Car size={15} /> السيارة</dt><dd>{make} {model} — موديل {year}</dd></div>
                      <div className="wiz-review-row"><dt><Route size={15} /> الممشى</dt><dd>{mileage ? `${mileage} كم` : 'غير محدد'}</dd></div>
                      <div className="wiz-review-row"><dt><Palette size={15} /> اللون</dt><dd>{color || 'غير محدد'}</dd></div>
                      <div className="wiz-review-row is-wide"><dt><MapPin size={15} /> الموقع</dt><dd>{city}، {district} — {address}</dd></div>
                      <div className="wiz-review-row"><dt><SlidersHorizontal size={15} /> نوع الفحص</dt><dd>{selected.join('، ')}</dd></div>
                      <div className="wiz-review-row"><dt><CalendarClock size={15} /> الموعد</dt><dd>{scheduledDate} — {scheduledTime}</dd></div>
                      <div className="wiz-review-row is-wide"><dt><StickyNote size={15} /> ملاحظات إضافية</dt><dd>{notes.trim() || 'لا توجد ملاحظات'}</dd></div>
                    </dl>
                    <p className="wiz-review-note">سيظهر الطلب للفاحصين المعتمدين في مدينتك، وستصلك العروض في لوحة العميل لمقارنتها واختيار الفاحص المناسب.</p>
                  </div>
                  <div className="wiz-note">
                    <span className="wiz-note-icon"><ShieldAlert size={20} /></span>
                    <p>لن يتم تأكيد أي دفع قبل اختيار الفاحص ومراجعة العرض. سيظهر الطلب في لوحة العميل لمتابعة العروض.</p>
                  </div>
                </div>}
              </section>

              {error && <p role="alert" className="wiz-error">{error}</p>}

              <div className="wiz-foot">
                <button type="button" disabled={step === 0 || saving} onClick={() => { setError(''); setStep((current) => current - 1) }} className="btn btn-ghost"><ArrowRight size={16} /> السابق</button>
                {step === steps.length - 1
                  ? <button type="button" disabled={saving} onClick={publishRequest} className="btn btn-primary">{saving ? <LoaderCircle className="size-4 animate-spin" /> : <Wallet size={16} />}{saving ? 'جارٍ نشر الطلب' : 'نشر طلب الفحص'}</button>
                  : <button type="button" onClick={() => { if (canContinue()) setStep((current) => current + 1) }} className="btn btn-primary">التالي <ArrowLeft size={16} /></button>}
              </div>
          </div>
        </div>
      </div>
    </main>
  </div>
}
