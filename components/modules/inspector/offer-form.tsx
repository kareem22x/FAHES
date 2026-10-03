'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LoaderCircle, Send } from 'lucide-react'

export function InspectorOfferForm({ inspectionId }: { inspectionId: string }) {
  const router = useRouter()
  const [price, setPrice] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  // «الطلب خرج من يدك» — الفرق مهم: هنا لا معنى لإعادة المحاولة، بل لتحديث
  // الصفحة حتى تختفي البطاقة الميتة. الرسالة وحدها بلا إجراء تترك الفاحص
  // يعيد الإرسال على طلب انقضى.
  const [stale, setStale] = useState(false)
  // «خارج مدنك» له إجراء مختلف تمامًا: لا تحديث ولا إعادة محاولة، بل توسيع
  // التغطية من قسم «نطاق العمل». الخادم يرسل `forbidden` صريحًا لهذا.
  const [outOfCoverage, setOutOfCoverage] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)

  async function submitOffer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setStale(false)
    setOutOfCoverage(false)

    try {
      const response = await fetch(`/api/inspections/${encodeURIComponent(inspectionId)}/offers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ price: Number(price), note }),
      })
      const data = await response.json()
      if (!response.ok) {
        setError(typeof data.error === 'string' ? data.error : 'تعذر إرسال العرض.')
        // `reason` يُرسله الخادم صريحًا — لا نستنتج من نصّ الرسالة.
        setStale(data.reason === 'closed' || data.reason === 'not_found')
        setOutOfCoverage(data.reason === 'forbidden')
        return
      }
      setSubmitted(true)
      router.refresh()
    } catch {
      setError('تعذر الاتصال بالخادم. حاول مرة أخرى.')
    } finally {
      setSaving(false)
    }
  }

  if (submitted) {
    return <p role="status" className="mt-4 rounded-lg border border-[#d6e8da] bg-[#f1f7f2] p-3 text-xs font-semibold text-[#326a46]">تم إرسال عرضك للعميل.</p>
  }

  return (
    <form onSubmit={submitOffer} className="inspector-offer-form">
      <label>
        <span>سعرك للفحص <small>ريال</small></span>
        <span className="inspector-price-input">
          <input
            required
            type="number"
            min="50"
            max="100000"
            step="1"
            inputMode="numeric"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            placeholder="مثال: 250"
          />
          <span>ر.س</span>
        </span>
      </label>
      <label>
        <span>رسالة للعميل <small>اختياري</small></span>
        <textarea
          rows={2}
          maxLength={500}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="اذكر ما يشمله عرضك أو أي تفاصيل مهمة"
        />
      </label>
      {error && (
        <p role="alert" className="text-xs font-semibold text-[#a6463a]">
          {error}
          {stale && (
            <>
              {' '}
              <button
                type="button"
                onClick={() => router.refresh()}
                className="underline underline-offset-2"
              >
                حدّث القائمة
              </button>
            </>
          )}
          {outOfCoverage && (
            <>
              {' '}
              <a href="#work-area" className="underline underline-offset-2">
                افتح نطاق العمل
              </a>
            </>
          )}
        </p>
      )}
      <button type="submit" disabled={saving} className="inspector-offer-submit">
        {saving ? <LoaderCircle size={15} className="animate-spin" /> : <Send size={15} />}
        {saving ? 'جارٍ إرسال العرض' : 'إرسال عرض السعر'}
      </button>
    </form>
  )
}
