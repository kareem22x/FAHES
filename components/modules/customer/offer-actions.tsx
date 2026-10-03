'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Check, LoaderCircle } from 'lucide-react'

export function CustomerOfferActions({
  inspectionId,
  offerId,
}: {
  inspectionId: string
  offerId: string
}) {
  const router = useRouter()
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function acceptOffer() {
    setSaving(true)
    setError('')
    try {
      const response = await fetch(
        `/api/inspections/${encodeURIComponent(inspectionId)}/offers/${encodeURIComponent(offerId)}`,
        { method: 'POST' },
      )
      const data = await response.json()
      if (!response.ok) {
        setError(typeof data.error === 'string' ? data.error : 'تعذر قبول العرض.')
        return
      }
      router.refresh()
    } catch {
      setError('تعذر الاتصال بالخادم. حاول مرة أخرى.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="app-offer-action">
      <button type="button" onClick={acceptOffer} disabled={saving} className="btn btn-primary btn-sm">
        {saving ? <LoaderCircle size={14} className="animate-spin" /> : <Check size={14} />}
        {saving ? 'جارٍ القبول' : 'قبول العرض'}
      </button>
      {error && <p role="alert" className="app-offer-error">{error}</p>}
    </div>
  )
}
