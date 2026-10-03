'use client'

import { CloudOff, Hash, MapPin, RefreshCw, ShieldAlert, ShieldCheck, Wifi } from 'lucide-react'
import type { FieldAction } from '@/lib/field/types'

const actionLabels: Record<string, string> = {
  claim: 'استلام الطلب',
  verify: 'إكمال التحقق المبدئي',
  start: 'بدء الفحص',
  status_change: 'تحديث حالة الزيارة',
  media_upload: 'رفع صورة أو مستند',
  media_delete: 'حذف مرفق',
  report_save: 'حفظ مسودة التقرير',
  report_submit: 'إرسال التقرير للعميل',
  cancel: 'إلغاء الطلب',
  handover_request: 'طلب تبديل',
  handover_accept: 'قبول التبديل',
  sync: 'مزامنة إجراءات دون اتصال',
  note: 'ملاحظة',
}

/**
 * Offline / sync banner.
 *
 * Distinguishes three states that are easy to conflate and dangerous to
 * conflate: the network is gone, the network is back but the queue is not yet
 * flushed, and the local queue itself is unavailable. The middle state is the
 * one that silently loses work if the UI says "connected" too early.
 */
export function FieldOfflineBanner({
  online,
  pendingCount,
  queueAvailable,
  syncing,
  onSync,
}: {
  online: boolean
  pendingCount: number
  queueAvailable: boolean
  syncing: boolean
  onSync: () => void
}) {
  if (!queueAvailable) {
    return (
      <div className="field-offline-banner" role="status">
        <ShieldAlert size={17} />
        <span>
          <strong>التخزين المحلي غير متاح.</strong> لن تُحفظ الإجراءات عند انقطاع الشبكة — ارفع الصور فورًا وتأكد من الاتصال قبل مغادرة الموقع.
        </span>
      </div>
    )
  }

  if (online && pendingCount === 0) return null

  return (
    <div className="field-offline-banner" role="status">
      {online ? <RefreshCw size={17} /> : <CloudOff size={17} />}
      <span>
        {online ? (
          <>
            <strong>لديك {pendingCount} إجراء بانتظار المزامنة.</strong> عاد الاتصال — يمكنك رفعها الآن.
          </>
        ) : (
          <>
            <strong>لا يوجد اتصال.</strong> تُحفَظ الإجراءات والصور محليًا وتُزامَن تلقائيًا عند عودة الشبكة
            {pendingCount > 0 ? ` (${pendingCount} بانتظار المزامنة)` : ''}.
          </>
        )}
      </span>
      {online && pendingCount > 0 && (
        <button type="button" onClick={onSync} disabled={syncing}>
          {syncing ? 'جارٍ المزامنة' : 'زامن الآن'}
        </button>
      )}
    </div>
  )
}

/** Compact connectivity chip for headers and ribbons. */
export function FieldConnectivityChip({ online, pendingCount }: { online: boolean; pendingCount: number }) {
  if (online && pendingCount === 0) {
    return <span className="field-chip is-ok"><Wifi size={13} /> متصل</span>
  }
  if (online) {
    return <span className="field-chip is-info"><RefreshCw size={13} /> {pendingCount} للمزامنة</span>
  }
  return <span className="field-chip is-warn"><CloudOff size={13} /> دون اتصال{pendingCount > 0 ? ` · ${pendingCount}` : ''}</span>
}

/**
 * The legal audit trail.
 *
 * Each row shows the three things that make a field action defensible in a
 * dispute: when it happened (RFC3339, as recorded by the device), where it
 * happened (GPS with the accuracy that was reported), and the chain hash that
 * proves the row has not been altered since.
 */
export function FieldAuditTrail({
  actions,
  chainLinked,
}: {
  actions: FieldAction[]
  chainLinked: boolean
}) {
  if (actions.length === 0) {
    return (
      <section className="inspector-detail-card" aria-label="سجل التدقيق">
        <div className="inspector-detail-card-heading">
          <div>
            <span className="inspector-section-kicker"><Hash size={14} /> سلسلة الحفظ</span>
            <h2>سجل التدقيق القانوني</h2>
          </div>
        </div>
        <p className="inspector-local-state">لم تُسجَّل إجراءات ميدانية على هذا الطلب بعد.</p>
      </section>
    )
  }

  return (
    <section className="inspector-detail-card" aria-label="سجل التدقيق">
      <div className="inspector-detail-card-heading">
        <div>
          <span className="inspector-section-kicker"><Hash size={14} /> سلسلة الحفظ</span>
          <h2>سجل التدقيق القانوني</h2>
        </div>
        <span className={`field-chip ${chainLinked ? 'is-ok' : 'is-bad'}`}>
          {chainLinked ? <><ShieldCheck size={13} /> السلسلة سليمة</> : <><ShieldAlert size={13} /> خلل في السلسلة</>}
        </span>
      </div>

      <p className="inspector-checklist-disclaimer">
        كل إجراء موقّع ببصمة SHA-256 مرتبطة بالإجراء السابق. أي تعديل أو حذف في السجل يكسر السلسلة ويظهر فورًا.
      </p>

      <div className="field-trail">
        {actions.map((action) => (
          <div
            key={action.id}
            className={`field-trail-row ${chainLinked ? 'is-chain-ok' : 'is-chain-bad'}`}
          >
            <div className="field-trail-rail"><span className="field-trail-dot" /></div>
            <div className="field-trail-body">
              <strong>
                {actionLabels[action.actionType] ?? action.actionType}
                {action.actionDetail ? ` · ${action.actionDetail}` : ''}
              </strong>
              <div className="field-trail-meta">
                <span dir="ltr">{action.recordedAtRfc3339}</span>
                {action.latitude !== null && action.longitude !== null ? (
                  <span dir="ltr">
                    <MapPin size={12} /> {action.latitude.toFixed(5)}, {action.longitude.toFixed(5)}
                    {action.accuracy !== null ? ` (±${Math.round(action.accuracy)}م)` : ''}
                  </span>
                ) : (
                  <span>بدون إحداثيات</span>
                )}
                {action.offlineQueued && <span className="field-status-tag is-pending">سُجّل دون اتصال</span>}
              </div>
              <span className="field-trail-hash" dir="ltr" title={action.contentHash}>
                #{action.id} {action.contentHash}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
