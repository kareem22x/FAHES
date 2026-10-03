'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Ban, Check, Loader2, Users } from 'lucide-react'
import { toast } from 'sonner'
import type { CancelReason, HandoverRequest } from '@/lib/field/types'
import { useFieldLocation } from './use-field-location'
import { useHaptics } from './field-hooks'

const cancelReasons: Array<{ key: CancelReason; label: string }> = [
  { key: 'vehicle_missing', label: 'السيارة غير موجودة' },
  { key: 'vehicle_sold', label: 'تم بيع السيارة' },
  { key: 'showroom_denied', label: 'المعرض رفض الدخول' },
  { key: 'location_mismatch', label: 'الموقع غير مطابق' },
  { key: 'safety_concern', label: 'سبب يتعلق بالسلامة' },
  { key: 'other', label: 'سبب آخر' },
]

const handoverReasons: Array<{ key: HandoverRequest['reason']; label: string }> = [
  { key: 'emergency', label: 'طارئ شخصي' },
  { key: 'vehicle_unavailable', label: 'السيارة غير متاحة' },
  { key: 'showroom_denied', label: 'المعرض رفض الدخول' },
  { key: 'safety', label: 'سبب أمني أو سلامة' },
  { key: 'other', label: 'سبب آخر' },
]

/**
 * Emergency cancel and shift handover.
 *
 * Both actions release the order, but they mean opposite things operationally:
 * a cancel means nobody should go, a handover means somebody else should go
 * now. Keeping them on one screen with different confirmation language is
 * deliberate — an inspector in a hurry must not pick the wrong one by muscle
 * memory.
 */
export function FieldEscalation({
  inspectionId,
  claimId,
  city,
  hasClaim,
  pendingHandover,
}: {
  inspectionId: string
  claimId: string | null
  city: string
  hasClaim: boolean
  pendingHandover: HandoverRequest | null
}) {
  const router = useRouter()
  const { fix } = useFieldLocation()
  const haptics = useHaptics()
  const [mode, setMode] = useState<'idle' | 'cancel' | 'handover'>('idle')
  const [reason, setReason] = useState<string>('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (!hasClaim || !claimId) return null

  async function submit(kind: 'cancel' | 'handover') {
    if (!reason) {
      setError('اختر سببًا للمتابعة.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`/api/inspector/field/${encodeURIComponent(inspectionId)}/${kind}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason,
          note,
          latitude: fix?.latitude ?? null,
          longitude: fix?.longitude ?? null,
          accuracy: fix?.accuracy ?? null,
        }),
      })
      const body = (await response.json()) as { status?: string; error?: string }
      if (!response.ok) throw new Error(body.error ?? 'تعذّر تنفيذ الإجراء.')

      haptics(kind === 'cancel' ? 'warning' : 'success')
      toast.success(kind === 'cancel' ? 'تم إلغاء الطلب وإعادته للقائمة' : 'تم إرسال طلب التبديل للفاحصين القريبين')
      setMode('idle')
      setReason('')
      setNote('')
      router.refresh()
    } catch (cause) {
      haptics('error')
      setError(cause instanceof Error ? cause.message : 'تعذّر تنفيذ الإجراء.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="inspector-detail-card" aria-label="الإلغاء والتبديل الميداني">
      <div className="inspector-detail-card-heading">
        <div>
          <span className="inspector-section-kicker"><AlertTriangle size={14} /> حالات ميدانية</span>
          <h2>الإلغاء والتبديل</h2>
        </div>
      </div>

      {pendingHandover && (
        <p className="field-chip is-info" style={{ width: '100%', marginBottom: 12 }}>
          <Users size={13} />
          طلب تبديل معلّق في {city} — ينتظر قبول فاحص قريب.
        </p>
      )}

      {mode === 'idle' ? (
        <div className="field-form-actions">
          <button type="button" className="inspector-secondary-link" onClick={() => { setMode('handover'); setReason('') }}>
            <Users size={15} /> طلب تبديل فوري
          </button>
          <button
            type="button"
            className="inspector-secondary-link"
            style={{ borderColor: 'rgb(244 63 94 / 40%)', color: '#fda4af' }}
            onClick={() => { setMode('cancel'); setReason('') }}
          >
            <Ban size={15} /> إلغاء الطلب
          </button>
        </div>
      ) : (
        <div className="field-form">
          <p className="inspector-checklist-disclaimer">
            {mode === 'cancel'
              ? 'سيُعاد الطلب إلى قائمة الطلبات المتاحة، ويُسجَّل الإلغاء بوقتك وموقعك وسببه في سجل التدقيق. قد تُطلب صورة إثبات.'
              : 'سيُرسَل طلب إلى الفاحصين المتصلين في نفس المدينة. يبقى الطلب باسمك حتى يقبله فاحص آخر.'}
          </p>

          <div className="field-reason-grid">
            {(mode === 'cancel' ? cancelReasons : handoverReasons).map((item) => (
              <button
                key={item.key}
                type="button"
                className={`field-reason ${reason === item.key ? 'is-selected' : ''}`}
                aria-pressed={reason === item.key}
                onClick={() => { setReason(item.key); haptics('tap') }}
              >
                {reason === item.key && <Check size={15} />}{item.label}
              </button>
            ))}
          </div>

          <label>
            ملاحظة للإدارة
            <textarea
              rows={3}
              maxLength={1000}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="اشرح الحالة بإيجاز ليصل السياق لفريق الدعم."
            />
          </label>

          {error && <p role="alert" className="field-warning"><AlertTriangle size={15} />{error}</p>}

          <div className="field-form-actions">
            <button
              type="button"
              className="inspector-primary-link"
              onClick={() => void submit(mode)}
              disabled={busy || (mode === 'handover' && Boolean(pendingHandover))}
            >
              {busy ? <Loader2 size={15} /> : <Check size={15} />}
              {busy ? 'جارٍ التنفيذ' : mode === 'cancel' ? 'تأكيد الإلغاء' : 'إرسال طلب التبديل'}
            </button>
            <button type="button" className="inspector-secondary-link" onClick={() => { setMode('idle'); setReason(''); setError('') }} disabled={busy}>
              رجوع
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
