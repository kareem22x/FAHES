'use client'

import { useCallback, useState } from 'react'
import { AlertTriangle, BatteryCharging, Bell, Check, LifeBuoy, Loader2, Loader2 as Spinner, Moon, Send, Vibrate } from 'lucide-react'
import { toast } from 'sonner'
import type { FieldPreferences, SupportTicket, SupportTicketCategory } from '@/lib/field/types'
import { useFieldAlert, useHaptics } from './field-hooks'
import { useFieldLocation } from './use-field-location'

// ---------------------------------------------------------------------------
// Preferences: dark mode, battery saver, audio, haptics
// ---------------------------------------------------------------------------

export function FieldPreferencesPanel({
  preferences,
  onChange,
  pendingCount,
  queueAvailable,
  onSync,
  syncing,
}: {
  preferences: FieldPreferences
  onChange: (patch: Partial<FieldPreferences>) => void
  pendingCount: number
  queueAvailable: boolean
  onSync: () => void
  syncing: boolean
}) {
  const haptics = useHaptics(preferences.haptics)
  const { unlock, play } = useFieldAlert(preferences.audioAlerts)

  return (
    <section className="inspector-requests-section" aria-label="إعدادات الميدان">
      <div className="inspector-requests-heading">
        <div>
          <span className="inspector-section-kicker"><Moon size={14} /> إعدادات الميدان</span>
          <h2>العرض والبطارية والتنبيهات</h2>
        </div>
      </div>

      <div className="field-form">
        <label className="field-switch">
          <span>
            <strong><Moon size={13} /> النمط الداكن الميداني</strong>
            <small>خلفية داكنة تساعد على القراءة تحت أشعة الشمس المباشرة.</small>
          </span>
          <input
            type="checkbox"
            checked={preferences.darkMode}
            onChange={(event) => { onChange({ darkMode: event.target.checked }); haptics('tap') }}
          />
          <span className="field-switch-track" aria-hidden="true" />
        </label>

        <label className="field-switch">
          <span>
            <strong><BatteryCharging size={13} /> موفّر البطارية</strong>
            <small>يوقف التمويه الخلفي والحركات الخفيفة — مفيد في يوم عمل طويل. معطّل افتراضيًا.</small>
          </span>
          <input
            type="checkbox"
            checked={preferences.batterySaver}
            onChange={(event) => { onChange({ batterySaver: event.target.checked }); haptics('tap') }}
          />
          <span className="field-switch-track" aria-hidden="true" />
        </label>

        <label className="field-switch">
          <span>
            <strong><Bell size={13} /> التنبيه الصوتي للطلبات</strong>
            <small>نبرة قصيرة عند وصول طلب جديد داخل مدنك.</small>
          </span>
          <input
            type="checkbox"
            checked={preferences.audioAlerts}
            onChange={(event) => {
              onChange({ audioAlerts: event.target.checked })
              if (event.target.checked) { unlock(); play() }
            }}
          />
          <span className="field-switch-track" aria-hidden="true" />
        </label>

        <label className="field-switch">
          <span>
            <strong><Vibrate size={13} /> الاهتزاز عند التأكيد</strong>
            <small>ردّ فعلي قصير عند كل إجراء مهم.</small>
          </span>
          <input
            type="checkbox"
            checked={preferences.haptics}
            onChange={(event) => { onChange({ haptics: event.target.checked }); if (event.target.checked) haptics('success') }}
          />
          <span className="field-switch-track" aria-hidden="true" />
        </label>
      </div>

      <div className="field-sync-list">
        <div className="field-sync-row">
          <span className={`field-chip ${queueAvailable ? 'is-ok' : 'is-warn'}`}>
            {queueAvailable ? <Check size={13} /> : <AlertTriangle size={13} />}
            {queueAvailable ? 'التخزين المحلي متاح' : 'التخزين المحلي غير متاح في هذا المتصفح'}
          </span>
          <span>{pendingCount > 0 ? `${pendingCount} إجراء بانتظار المزامنة` : 'لا إجراءات معلّقة'}</span>
          {pendingCount > 0 && (
            <button type="button" onClick={onSync} disabled={syncing}>
              {syncing ? <Loader2 size={13} /> : null}
              {syncing ? 'جارٍ المزامنة' : 'زامن الآن'}
            </button>
          )}
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Support tickets
// ---------------------------------------------------------------------------

const ticketCategories: Array<{ key: SupportTicketCategory; label: string }> = [
  { key: 'technical', label: 'مشكلة تقنية' },
  { key: 'showroom_dispute', label: 'نزاع مع معرض' },
  { key: 'location_mismatch', label: 'موقع غير مطابق' },
  { key: 'payment', label: 'مستحقات' },
  { key: 'safety', label: 'سلامة' },
  { key: 'account', label: 'الحساب والاعتماد' },
  { key: 'other', label: 'أخرى' },
]

const ticketStatusLabels: Record<SupportTicket['status'], string> = {
  open: 'مفتوحة',
  in_review: 'قيد المراجعة',
  resolved: 'تم الحل',
  closed: 'مغلقة',
}

export function FieldSupport({
  tickets,
  inspectionId,
  claimId,
}: {
  tickets: SupportTicket[]
  inspectionId: string | null
  claimId: string | null
}) {
  const { fix } = useFieldLocation()
  const haptics = useHaptics()
  const [category, setCategory] = useState<SupportTicketCategory>('technical')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [priority, setPriority] = useState<SupportTicket['priority']>('normal')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = useCallback(async () => {
    if (subject.trim().length < 3) {
      setError('اكتب عنوانًا واضحًا للمشكلة (٣ أحرف على الأقل).')
      return
    }
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/inspector/field/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          subject: subject.trim(),
          body: body.trim(),
          priority,
          inspectionId,
          claimId,
          latitude: fix?.latitude ?? null,
          longitude: fix?.longitude ?? null,
        }),
      })
      const result = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(result.error ?? 'تعذّر إرسال التذكرة.')
      haptics('success')
      toast.success('تم إرسال التذكرة — ستصلك المتابعة من فريق الدعم.')
      setSubject('')
      setBody('')
      setPriority('normal')
    } catch (cause) {
      haptics('error')
      setError(cause instanceof Error ? cause.message : 'تعذّر إرسال التذكرة.')
    } finally {
      setBusy(false)
    }
  }, [body, category, claimId, fix, haptics, inspectionId, priority, subject])

  return (
    <section className="inspector-requests-section" aria-label="الدعم الفني الميداني">
      <div className="inspector-requests-heading">
        <div>
          <span className="inspector-section-kicker"><LifeBuoy size={14} /> الدعم الميداني</span>
          <h2>تذكرة دعم</h2>
        </div>
        <span className="inspector-section-count">{tickets.length} تذكرة</span>
      </div>

      <div className="field-form">
        <label>
          التصنيف
          <select value={category} onChange={(event) => setCategory(event.target.value as SupportTicketCategory)}>
            {ticketCategories.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
          </select>
        </label>
        <label>
          الأولوية
          <select value={priority} onChange={(event) => setPriority(event.target.value as SupportTicket['priority'])}>
            <option value="low">منخفضة</option>
            <option value="normal">عادية</option>
            <option value="high">عالية</option>
            <option value="urgent">عاجلة</option>
          </select>
        </label>
        <label>
          العنوان
          <input
            value={subject}
            maxLength={200}
            onChange={(event) => setSubject(event.target.value)}
            placeholder="مثال: المعرض رفض الدخول بعد تأكيد الموعد"
          />
        </label>
        <label>
          التفاصيل
          <textarea
            rows={4}
            maxLength={4000}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="اذكر رقم الطلب والوقت وما حدث بالتفصيل."
          />
        </label>

        {error && <p role="alert" className="field-warning"><AlertTriangle size={15} />{error}</p>}

        <div className="field-form-actions">
          <button type="button" className="inspector-primary-link" onClick={() => void submit()} disabled={busy}>
            {busy ? <Spinner size={15} /> : <Send size={15} />}
            {busy ? 'جارٍ الإرسال' : 'إرسال التذكرة'}
          </button>
        </div>
        {fix && (
          <p className="field-chip is-info" style={{ width: '100%' }}>
            <Check size={13} />
            سيُرفق موقعك الحالي ({fix.latitude.toFixed(4)}, {fix.longitude.toFixed(4)}) مع التذكرة.
          </p>
        )}
      </div>

      {tickets.length > 0 && (
        <div className="field-tickets">
          {tickets.map((ticket) => (
            <article key={ticket.id} className="field-ticket">
              <div className="field-ticket-head">
                <strong>{ticket.subject}</strong>
                <span className={`field-status-tag ${ticket.status === 'resolved' || ticket.status === 'closed' ? 'is-available' : 'is-pending'}`}>
                  {ticketStatusLabels[ticket.status]}
                </span>
              </div>
              {ticket.body && <p>{ticket.body}</p>}
              <div className="field-ticket-meta">
                <span>{new Intl.DateTimeFormat('ar-SA', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ticket.createdAt))}</span>
                {ticket.inspectionId && <span>{ticket.inspectionId}</span>}
                {ticket.resolutionNote && <span>{ticket.resolutionNote}</span>}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
