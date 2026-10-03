'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, LoaderCircle, MapPin, Radio, Save } from 'lucide-react'

type InspectorProfileSettingsProps = {
  cities: string[]
  isOnline: boolean
  availableCities: readonly string[]
}

export function InspectorProfileSettings({
  cities: initialCities,
  isOnline: initialIsOnline,
  availableCities,
}: InspectorProfileSettingsProps) {
  const router = useRouter()
  const [cities, setCities] = useState(initialCities)
  const [isOnline, setIsOnline] = useState(initialIsOnline)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  /**
   * المدن التي يُزيلها الحفظ الحالي.
   *
   * كان الفاحص يضغط «حفظ» بلا أن يعرف أنه **يفقد** تغطية: إزالة مدينة كانت
   * محفوظة تعني أن الطلبات المفتوحة فيها تختفي من قائمته فورًا، وأي عرض
   * قادم عليها يُرفض بـ«الطلب خارج مدن عملك» — وهو ما حدث فعلًا (حُفظت
   * الجبيل وحدها فسقطت الدمام، ثم رُفض العرض على طلب الدمام).
   *
   * لا نمنع الإزالة (للفاحص أن يقلّص نطاقه)، لكن نُسمّيها قبل الحفظ.
   */
  const droppedCities = initialCities.filter((city) => !cities.includes(city))

  function toggleCity(city: string) {
    setCities((current) => (
      current.includes(city) ? current.filter((item) => item !== city) : [...current, city]
    ))
    setMessage('')
    setError('')
  }

  async function saveProfile() {
    if (isOnline && cities.length === 0) {
      setError('اختر مدينة واحدة على الأقل قبل تفعيل حالة التوفر.')
      return
    }

    if (droppedCities.length > 0) {
      const confirmed = window.confirm(
        `ستُلغى تغطيتك في: ${droppedCities.join('، ')}.\n\n` +
        'لن تصلك طلبات جديدة من هذه المدن، وأي عرض على طلب فيها سيُرفض. هل تريد المتابعة؟',
      )
      if (!confirmed) return
    }

    setSaving(true)
    setError('')
    setMessage('')

    try {
      const response = await fetch('/api/inspectors/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isOnline, cities }),
      })
      const data = await response.json()

      if (!response.ok) {
        setError(typeof data.error === 'string' ? data.error : 'تعذر حفظ التغييرات.')
        return
      }

      setMessage(
        droppedCities.length > 0
          ? `تم الحفظ. أُلغي وصولك إلى: ${droppedCities.join('، ')}.`
          : 'تم حفظ حالة التوفر ومدن العمل.',
      )
      router.refresh()
    } catch {
      setError('تعذر الاتصال بالخادم. حاول مرة أخرى.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="inspector-panel p-5 sm:p-7" aria-labelledby="inspector-settings-title">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <span className="inspector-section-kicker"><MapPin size={14} /> نطاق العمل</span>
          <h2 id="inspector-settings-title" className="mt-2 text-xl font-bold">مدن الفحص والتوفر</h2>
          <p className="mt-2 max-w-xl text-sm leading-7 text-[#687870]">
            اختر المدن التي تستطيع الوصول إليها، وحدّث توفرك حسب جدولك.
          </p>
        </div>
        <label className={`inspector-presence ${isOnline ? 'is-online' : ''}`}>
          <input
            checked={isOnline}
            onChange={(event) => {
              setIsOnline(event.target.checked)
              setMessage('')
              setError('')
            }}
            type="checkbox"
          />
          <span className="inspector-presence-indicator"><Radio size={16} /></span>
          <span><strong>{isOnline ? 'متاح للفحص' : 'غير متاح'}</strong><small>يمكنك تعديلها في أي وقت</small></span>
        </label>
      </div>

      <div className="inspector-city-picker" aria-label="مدن العمل في المنطقة الشرقية">
        {availableCities.map((city) => {
          const selected = cities.includes(city)
          return (
            <button
              key={city}
              type="button"
              aria-pressed={selected}
              className={`inspector-city-option ${selected ? 'is-selected' : ''}`}
              onClick={() => toggleCity(city)}
            >
              <MapPin size={14} />
              {city}
              {selected && <Check size={14} />}
            </button>
          )
        })}
      </div>

      <div className="mt-5 flex flex-col gap-4 border-t border-[#e8ebe6] pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-6 text-[#77827b]">
          حالة التوفر ومدن العمل تحددان الطلبات التي تظهر لك وإمكانية إرسال عرض عليها.
        </p>
        <button
          type="button"
          onClick={saveProfile}
          disabled={saving}
          className="inspector-save-button"
        >
          {saving ? <LoaderCircle className="size-4 animate-spin" /> : <Save size={16} />}
          {saving ? 'جارٍ الحفظ' : 'حفظ التغييرات'}
        </button>
      </div>

      {error && <p role="alert" className="mt-4 text-sm font-semibold text-[#a6463a]">{error}</p>}
      {message && <p role="status" className="mt-4 text-sm font-semibold text-[#316c4c]">{message}</p>}
    </section>
  )
}
