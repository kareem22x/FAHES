import Link from 'next/link'
import {
  ArrowLeft,
  BadgeCheck,
  CarFront,
  Clock3,
  FileText,
  Flag,
  Gavel,
  Images,
  ShieldCheck,
  UsersRound,
} from 'lucide-react'
import { adminOverview, listAuditEvents, listInspectionAnnotations, listAllInspections } from '@/lib/admin/store'
import { auditEventLabel, auditEventTone } from '@/lib/admin/labels'
import { formatArabicDate, formatArabicNumber, statusOf } from '@/lib/inspection-status'
import { listUsers } from '@/lib/user-store'
import { LiveRefresh } from '@/components/admin/live-refresh'

export const dynamic = 'force-dynamic'

/** Inspection status tone → the `admin-badge-*` colour families. */
const statusBadge = {
  done: 'good',
  cancelled: 'bad',
  progress: 'neutral',
  open: 'warn',
} as const

export default async function AdminOverviewPage() {
  // `activityTrend(14)` used to be awaited here and then never rendered — two
  // extra queries on every overview load feeding a variable nothing read. The
  // 14-day series belongs to `/admin/analytics`, which computes it properly.
  const [stats, recentAudit, inspections, annotations, users] = await Promise.all([
    adminOverview(),
    listAuditEvents({ limit: 8 }),
    listAllInspections(),
    listInspectionAnnotations(),
    listUsers(),
  ])

  const nameById = new Map(users.map((user) => [user.id, user.name]))
  const flagged = [...annotations.values()].filter((annotation) => annotation.decision === 'flagged')

  // Every row links to the console section that actually resolves it, rather
  // than all four pointing at `/admin/inspections` — a flagged report is a
  // quality-review job, a stalled offer is a dispute.
  const attention = [
    { icon: <Clock3 size={14} />, label: 'فاحصون بانتظار الاعتماد', value: stats.pendingInspectors, href: '/admin/inspectors' },
    { icon: <CarFront size={14} />, label: 'طلبات بانتظار العروض', value: stats.openInspections, href: '/admin/inspections' },
    { icon: <Gavel size={14} />, label: 'عروض معلّقة', value: stats.pendingOffers, href: '/admin/disputes' },
    { icon: <Flag size={14} />, label: 'تقارير معلَّمة للمراجعة', value: flagged.length, href: '/admin/quality-reviews' },
  ].filter((item) => item.value > 0)

  return (
    <div className="flex flex-col gap-5">
      {/* ── Page header ── */}
      <header className="admin-page-header">
        <div>
          <span className="admin-page-kicker">
            <span className="admin-page-kicker-dot" />
            لوحة الإدارة
          </span>
          <h1>
            نظرة عامة على المنصة
            <span className="admin-section-count" style={{ marginInlineStart: 12, verticalAlign: 'middle' }}>
              {formatArabicNumber(stats.inspections)} طلب
            </span>
          </h1>
          <p>متابعة شاملة لنشاط المستخدمين والفاحصين وطلبات الفحص.</p>
        </div>
        <span className="admin-page-badge">
          <ShieldCheck size={15} />
          صلاحيات إدارية
        </span>
      </header>

      {/* ── Primary KPIs ── */}
      <section className="admin-stats-grid" aria-label="ملخص النشاط">
        <div className="admin-stat-card">
          <span className="admin-stat-icon">
            <UsersRound size={19} />
          </span>
          <span className="admin-stat-label">إجمالي المستخدمين</span>
          <strong>{formatArabicNumber(stats.users)}</strong>
          <small>
            {formatArabicNumber(stats.customers)} عميل · {formatArabicNumber(stats.inspectors)} فاحص
          </small>
        </div>
        <div className="admin-stat-card">
          <span className="admin-stat-icon">
            <CarFront size={19} />
          </span>
          <span className="admin-stat-label">طلبات الفحص</span>
          <strong>{formatArabicNumber(stats.inspections)}</strong>
          <small>{formatArabicNumber(stats.activeInspections)} قيد التنفيذ</small>
        </div>
        <div className="admin-stat-card">
          <span className="admin-stat-icon">
            <Clock3 size={19} />
          </span>
          <span className="admin-stat-label">بانتظار الاعتماد</span>
          <strong>{formatArabicNumber(stats.pendingInspectors)}</strong>
          <small>طلبات انضمام فاحصين</small>
        </div>
        <div className="admin-stat-card">
          <span className="admin-stat-icon">
            <FileText size={19} />
          </span>
          <span className="admin-stat-label">تقارير مرفوعة</span>
          <strong>{formatArabicNumber(stats.reports)}</strong>
          <small>{formatArabicNumber(stats.media)} ملف وسائط</small>
        </div>
      </section>

      {/* ── Secondary figures ── */}
      <section className="admin-mini-stats" aria-label="حالة العمليات">
        <div className="admin-mini-stat">
          <span>فحوصات مكتملة</span>
          <strong>{formatArabicNumber(stats.completedInspections)}</strong>
        </div>
        <div className="admin-mini-stat">
          <span>طلبات ملغاة</span>
          <strong>{formatArabicNumber(stats.cancelledInspections)}</strong>
        </div>
        <div className="admin-mini-stat">
          <span>عروض مقدَّمة</span>
          <strong>{formatArabicNumber(stats.offers)}</strong>
        </div>
        <div className="admin-mini-stat">
          <span>معلَّم للمراجعة</span>
          <strong>{formatArabicNumber(stats.flaggedInspections)}</strong>
        </div>
      </section>

      {/* ── Privacy notice ── */}
      <div className="admin-notice">
        <span>
          <ShieldCheck size={18} />
        </span>
        <p>
          <strong>خصوصية البيانات.</strong> بيانات العملاء وعناوين المركبات محمية. الوصول إليها
          يُسجَّل في سجل التدقيق.
        </p>
      </div>

      {/* ── Recent requests + side column ── */}
      <div className="admin-main-grid">
        <div className="admin-panel">
          <div className="admin-section-head" style={{ padding: '20px 22px 0' }}>
            <div>
              <span className="admin-page-kicker">
                <span className="admin-page-kicker-dot" />
                آخر النشاط
              </span>
              <h2>آخر الطلبات</h2>
            </div>
            <Link href="/admin/inspections" className="admin-section-count">
              عرض الكل <ArrowLeft size={12} />
            </Link>
          </div>

          {inspections.length === 0 ? (
            <div className="admin-empty">
              <span>
                <CarFront size={23} />
              </span>
              <h3>لا توجد طلبات فحص بعد</h3>
              <p>ستظهر الطلبات الجديدة هنا فور إنشائها.</p>
            </div>
          ) : (
            <div className="admin-table-wrap" style={{ marginTop: 16 }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>المركبة</th>
                    <th>المدينة</th>
                    <th>العميل</th>
                    <th>التاريخ</th>
                    <th>الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {inspections.slice(0, 8).map((inspection) => {
                    const meta = statusOf(inspection.status)
                    const annotation = annotations.get(inspection.id)
                    return (
                      <tr key={inspection.id}>
                        <td>
                          <span className="admin-table-strong">
                            {inspection.vehicle.make} {inspection.vehicle.model}
                          </span>
                          <span className="admin-table-sub" style={{ marginInlineStart: 6 }}>
                            {inspection.vehicle.year}
                          </span>
                        </td>
                        <td>{inspection.city}</td>
                        <td>{nameById.get(inspection.customerId) ?? '—'}</td>
                        <td>
                          <time dir="ltr">{formatArabicDate(inspection.createdAt, { dateStyle: 'short' })}</time>
                        </td>
                        <td>
                          <div className="flex items-center gap-1.5">
                            {annotation?.decision === 'flagged' && (
                              <span className="admin-badge admin-badge-bad">
                                <Flag size={10} /> معلَّم
                              </span>
                            )}
                            <span className={`admin-badge admin-badge-${statusBadge[meta.tone]}`}>
                              {meta.label}
                            </span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <div className="admin-side-card admin-panel">
            <span className="admin-side-card-icon">
              <Clock3 size={20} />
            </span>
            <h2>يحتاج انتباهك</h2>
            <p>عناصر معلّقة تنتظر قرارًا إداريًا.</p>
            {attention.length === 0 ? (
              <div className="admin-empty" style={{ minHeight: 120 }}>
                <h3>لا شيء معلّقًا الآن</h3>
                <p>كل الطلبات مُعالجة.</p>
              </div>
            ) : (
              <ul className="flex flex-col gap-2">
                {attention.map((item) => (
                  <li key={item.label}>
                    <Link href={item.href} className="admin-attention-link">
                      <span>{item.icon}</span>
                      <span>{item.label}</span>
                      <strong>{formatArabicNumber(item.value)}</strong>
                      <ArrowLeft size={12} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="admin-event-stream">
            <div className="admin-event-stream-head">
              <h3>بث الأحداث</h3>
              <LiveRefresh />
            </div>
            {recentAudit.length === 0 ? (
              <p className="admin-footnote" style={{ padding: '18px 0', textAlign: 'center' }}>
                لا توجد أحداث مسجّلة بعد.
              </p>
            ) : (
              <ul className="admin-event-list">
                {recentAudit.map((event) => (
                  <li key={event.id} className="admin-event-row">
                    <span className={`admin-badge admin-badge-${auditEventTone(event.event_type)}`}>
                      {auditEventLabel(event.event_type)}
                    </span>
                    <span>{event.actor_id ? (nameById.get(event.actor_id) ?? '—') : 'النظام'}</span>
                    <time dir="ltr">
                      {formatArabicDate(event.created_at, { timeStyle: 'short', dateStyle: 'short' })}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <footer className="admin-footer">
        <span>فاحص · لوحة الإدارة</span>
        <span>بيانات العملاء وعناوين المركبات محمية.</span>
      </footer>
    </div>
  )
}
