'use client'

import { Award, Camera, Check, Medal, ShieldCheck, Zap } from 'lucide-react'
import type { BadgeKey, FieldAnalytics, InspectorBadge, WalletSummary } from '@/lib/field/types'
import { QrCode } from './qr-code'

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

const badgeIcons = {
  shield: ShieldCheck,
  zap: Zap,
  award: Award,
  check: Check,
  camera: Camera,
  medal: Medal,
} as const

/** The full catalogue, so a locked badge still explains what it takes. */
export const badgeCatalogue: Array<Omit<InspectorBadge, 'earnedAt' | 'metricValue'>> = [
  { key: 'reliable', label: 'فاحص موثوق', description: 'إتمام 95% من الطلبات المستلمة دون إلغاء', icon: 'shield' },
  { key: 'fastest_responder', label: 'أسرع استجابة', description: 'متوسط زمن استجابة أقل من 15 دقيقة', icon: 'zap' },
  { key: 'century_club', label: '100 فحص موثّق', description: 'إتمام مئة فحص معتمد', icon: 'award' },
  { key: 'zero_cancellations', label: 'صفر إلغاء', description: '30 يومًا متواصلة دون إلغاء ميداني', icon: 'check' },
  { key: 'documentation_ace', label: 'تميّز التوثيق', description: 'اكتمال الصور الإلزامية في كل فحص', icon: 'camera' },
  { key: 'veteran', label: 'فاحص مخضرم', description: 'سنة كاملة من العمل الميداني', icon: 'medal' },
]

export function FieldBadges({ earned }: { earned: Array<{ key: BadgeKey; earnedAt: string; metricValue: number | null }> }) {
  const earnedMap = new Map(earned.map((item) => [item.key, item]))

  return (
    <section className="inspector-requests-section" aria-label="شارات التميز">
      <div className="inspector-requests-heading">
        <div>
          <span className="inspector-section-kicker"><Award size={14} /> التميّز المهني</span>
          <h2>شارات الأداء</h2>
        </div>
        <span className="inspector-section-count">{earned.length} من {badgeCatalogue.length}</span>
      </div>

      <div className="field-badges">
        {badgeCatalogue.map((badge) => {
          const got = earnedMap.get(badge.key)
          const Icon = badgeIcons[badge.icon]
          return (
            <div key={badge.key} className={`field-badge ${got ? 'is-earned' : 'is-locked'}`}>
              <span className="field-badge-icon"><Icon size={21} /></span>
              <span>
                <strong>{badge.label}</strong>
                <small>
                  {got
                    ? got.metricValue !== null
                      ? `مُحرَز بقيمة ${new Intl.NumberFormat('ar-SA').format(got.metricValue)}`
                      : 'مُحرَز'
                    : badge.description}
                </small>
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

export function FieldAnalyticsPanel({
  analytics,
  range,
  onRangeChange,
}: {
  analytics: FieldAnalytics
  range: 'week' | 'month'
  onRangeChange: (range: 'week' | 'month') => void
}) {
  const peak = Math.max(1, ...analytics.series.map((point) => point.completed + point.cancelled))

  return (
    <section className="inspector-requests-section" aria-label="الإحصائيات">
      <div className="inspector-requests-heading">
        <div>
          <span className="inspector-section-kicker"><Zap size={14} /> مؤشرات الأداء</span>
          <h2>الأداء الميداني</h2>
        </div>
        <div className="field-range-switch" role="group" aria-label="نطاق الفترة">
          <button type="button" className={range === 'week' ? 'is-current' : ''} onClick={() => onRangeChange('week')}>أسبوعي</button>
          <button type="button" className={range === 'month' ? 'is-current' : ''} onClick={() => onRangeChange('month')}>شهري</button>
        </div>
      </div>

      <div className="field-kpis">
        <div className="field-kpi">
          <span><Check size={14} /> فحوصات مكتملة</span>
          <strong>{new Intl.NumberFormat('ar-SA').format(analytics.completed)}</strong>
          <small>خلال الفترة المحددة</small>
        </div>
        <div className="field-kpi">
          <span><Award size={14} /> نسبة الإنجاز</span>
          <strong>{analytics.completionRate.toLocaleString('ar-SA', { maximumFractionDigits: 0 })}%</strong>
          <small>{new Intl.NumberFormat('ar-SA').format(analytics.cancelled)} طلب ملغى</small>
        </div>
        <div className="field-kpi">
          <span><Zap size={14} /> متوسط زمن الفحص</span>
          <strong>
            {analytics.averageTurnaroundMinutes === null
              ? '—'
              : `${analytics.averageTurnaroundMinutes.toLocaleString('ar-SA', { maximumFractionDigits: 0 })} د`}
          </strong>
          <small>من الاستلام حتى إرسال التقرير</small>
        </div>
        <div className="field-kpi">
          <span><ShieldCheck size={14} /> اعتماد التقارير</span>
          <strong>
            {analytics.approvalRate === null
              ? '—'
              : `${analytics.approvalRate.toLocaleString('ar-SA', { maximumFractionDigits: 0 })}%`}
          </strong>
          <small>تقارير قبلتها الإدارة دون تعديل</small>
        </div>
      </div>

      <div className="field-bars">
        {analytics.series.map((point) => (
          <div key={point.label} className="field-bar-row">
            <span>{point.label}</span>
            <div
              className="field-bar-track"
              role="img"
              aria-label={`${point.label}: ${point.completed} مكتمل، ${point.cancelled} ملغى`}
            >
              <span className="field-bar-completed" style={{ width: `${(point.completed / peak) * 100}%` }} />
              <span className="field-bar-cancelled" style={{ width: `${(point.cancelled / peak) * 100}%` }} />
            </div>
            <strong>{point.completed}</strong>
          </div>
        ))}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Wallet
// ---------------------------------------------------------------------------

const walletStatusLabels: Record<WalletSummary['entries'][number]['status'], { label: string; className: string }> = {
  pending: { label: 'قيد التسوية', className: 'is-pending' },
  available: { label: 'متاح', className: 'is-available' },
  requested: { label: 'مطلوب تحويله', className: 'is-requested' },
  paid: { label: 'محوّل', className: 'is-paid' },
}

export function FieldWallet({
  wallet,
  onRequestPayout,
  requesting,
}: {
  wallet: WalletSummary
  onRequestPayout: () => void
  requesting: boolean
}) {
  const currency = (value: number) =>
    `${new Intl.NumberFormat('ar-SA', { maximumFractionDigits: 2 }).format(value)} ر.س`

  return (
    <section className="inspector-requests-section" aria-label="المحفظة والمستحقات">
      <div className="inspector-requests-heading">
        <div>
          <span className="inspector-section-kicker"><Award size={14} /> المحفظة</span>
          <h2>المستحقات</h2>
        </div>
      </div>

      <div className="field-wallet-hero">
        <span>صافي الرصيد</span>
        <strong>{currency(wallet.netBalance)} <small>ر.س</small></strong>
        <div className="field-wallet-split">
          <div><span>متاح للتحويل</span><strong>{currency(wallet.availableBalance)}</strong></div>
          <div><span>قيد التسوية</span><strong>{currency(wallet.pendingBalance)}</strong></div>
          <div><span>مطلوب تحويله</span><strong>{currency(wallet.requestedBalance)}</strong></div>
          <div><span>إجمالي مدى الحياة</span><strong>{currency(wallet.lifetimeTotal)}</strong></div>
        </div>
      </div>

      <div className="field-form-actions" style={{ marginTop: 14 }}>
        <button
          type="button"
          className="inspector-primary-link"
          onClick={onRequestPayout}
          disabled={requesting || wallet.availableBalance <= 0}
        >
          {requesting ? 'جارٍ الإرسال' : 'طلب تحويل المستحقات'}
        </button>
      </div>
      {wallet.lastPayoutRequestAt && (
        <p className="field-chip is-info" style={{ marginTop: 10 }}>
          آخر طلب تحويل: {new Intl.DateTimeFormat('ar-SA', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(wallet.lastPayoutRequestAt))}
        </p>
      )}

      <div className="field-ledger">
        {wallet.entries.length === 0 ? (
          <p className="inspector-local-state">لا توجد حركات مالية مسجّلة بعد.</p>
        ) : (
          wallet.entries.map((entry) => {
            const status = walletStatusLabels[entry.status]
            return (
              <div key={entry.id} className="field-ledger-row">
                <div>
                  <strong>{entry.vehicleLabel}</strong>
                  <small>
                    {entry.inspectionId} · {new Intl.DateTimeFormat('ar-SA', { dateStyle: 'medium' }).format(new Date(entry.completedAt))}
                  </small>
                </div>
                <div style={{ display: 'grid', justifyItems: 'end', gap: 5 }}>
                  <span className="field-ledger-amount">{currency(entry.amount)}</span>
                  <span className={`field-status-tag ${status.className}`}>{status.label}</span>
                </div>
              </div>
            )
          })
        )}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// QR + legal archive
// ---------------------------------------------------------------------------

export function FieldQrArchive({
  origin,
  inspections,
}: {
  origin: string
  inspections: Array<{ id: string; vehicleLabel: string; completedAt: string; city: string }>
}) {
  return (
    <section className="inspector-requests-section" aria-label="الأرشيف الموثق">
      <div className="inspector-requests-heading">
        <div>
          <span className="inspector-section-kicker"><ShieldCheck size={14} /> كود QR والأرشيف</span>
          <h2>أرشيف الفحوصات الموثّق</h2>
        </div>
        <span className="inspector-section-count">{inspections.length} تقرير</span>
      </div>

      {inspections.length === 0 ? (
        <div className="inspector-empty-state">
          <span><ShieldCheck size={22} /></span>
          <h3>لا توجد تقارير مكتملة بعد</h3>
          <p>يظهر هنا كود QR لكل فحص مكتمل، ليتمكن المشتري أو المعرض من مسحه وفتح التقرير الرسمي فورًا.</p>
        </div>
      ) : (
        <div className="field-order-grid">
          {inspections.map((inspection) => {
            const url = `${origin}/reports/${inspection.id}`
            return (
              <div key={inspection.id} className="field-qr-card">
                <div className="field-qr-frame">
                  <QrCode value={url} title={`رمز QR لتقرير ${inspection.id}`} />
                </div>
                <div style={{ textAlign: 'center' }}>
                  <strong style={{ display: 'block', color: 'var(--field-text)', fontSize: 14 }}>
                    {inspection.vehicleLabel}
                  </strong>
                  <small style={{ display: 'block', marginTop: 4, color: 'var(--field-text-muted)', fontSize: 12 }}>
                    {inspection.id} · {inspection.city} · {new Intl.DateTimeFormat('ar-SA', { dateStyle: 'medium' }).format(new Date(inspection.completedAt))}
                  </small>
                </div>
                <a className="field-qr-link" href={url} target="_blank" rel="noreferrer">{url}</a>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
