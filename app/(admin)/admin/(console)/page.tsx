import Link from 'next/link'
import { ArrowLeft, BadgeCheck, CarFront, Clock3, FileText, Gavel, Flag, Images, ShieldCheck, UsersRound } from 'lucide-react'
import { activityTrend, adminOverview, listAuditEvents, listInspectionAnnotations, listAllInspections } from '@/lib/admin/store'
import { auditEventLabel, auditEventTone } from '@/lib/admin/labels'
import { formatArabicDate, formatArabicNumber, statusOf } from '@/lib/inspection-status'
import { listUsers } from '@/lib/user-store'
import { LiveRefresh } from '@/components/admin/live-refresh'

export const dynamic = 'force-dynamic'

const statusTone = {
  done: 'good',
  cancelled: 'bad',
  progress: 'neutral',
  open: 'warn',
} as const

const statIcons = {
  users: UsersRound,
  inspections: CarFront,
  pending: Clock3,
  reports: FileText,
}

export default async function AdminOverviewPage() {
  const [stats, trend, recentAudit, inspections, annotations, users] = await Promise.all([
    adminOverview(),
    activityTrend(14),
    listAuditEvents({ limit: 10 }),
    listAllInspections(),
    listInspectionAnnotations(),
    listUsers(),
  ])

  const nameById = new Map(users.map((user) => [user.id, user.name]))
  const flagged = [...annotations.values()].filter((annotation) => annotation.decision === 'flagged')

  const attention = [
    { icon: <Clock3 className="size-3.5" />, label: 'فاحصون بانتظار الاعتماد', value: stats.pendingInspectors, href: '/admin/inspectors' },
    { icon: <CarFront className="size-3.5" />, label: 'طلبات بانتظار العروض', value: stats.openInspections, href: '/admin/inspections' },
    { icon: <Gavel className="size-3.5" />, label: 'عروض معلّقة', value: stats.pendingOffers, href: '/admin/inspections' },
    { icon: <Flag className="size-3.5" />, label: 'تقارير معلَّمة للمراجعة', value: flagged.length, href: '/admin/inspections' },
  ].filter((item) => item.value > 0)

  return (
    <div className="flex flex-col gap-5">
      {/* ── Welcome ── */}
      <section className="inspector-welcome">
        <div>
          <span className="inspector-section-kicker"><span className="inspector-kicker-dot" /> لوحة الإدارة</span>
          <h1>نظرة عامة على المنصة</h1>
          <p>متابعة شاملة لنشاط المستخدمين والفاحصين وطلبات الفحص.</p>
        </div>
        <span className="inspector-approved-badge"><ShieldCheck size={17} /> صلاحيات إدارية</span>
      </section>

      {/* ── Stats Grid ── */}
      <section className="inspector-stats-grid" aria-label="ملخص النشاط">
        <div className="inspector-stat-card">
          <span className="inspector-stat-icon"><UsersRound size={19} /></span>
          <span className="inspector-stat-label">إجمالي المستخدمين</span>
          <strong>{formatArabicNumber(stats.users)}</strong>
          <small>{formatArabicNumber(stats.customers)} عميل · {formatArabicNumber(stats.inspectors)} فاحص</small>
        </div>
        <div className="inspector-stat-card">
          <span className="inspector-stat-icon"><CarFront size={19} /></span>
          <span className="inspector-stat-label">طلبات الفحص</span>
          <strong>{formatArabicNumber(stats.inspections)}</strong>
          <small>{formatArabicNumber(stats.activeInspections)} قيد التنفيذ</small>
        </div>
        <div className="inspector-stat-card">
          <span className="inspector-stat-icon"><Clock3 size={19} /></span>
          <span className="inspector-stat-label">بانتظار الاعتماد</span>
          <strong>{formatArabicNumber(stats.pendingInspectors)}</strong>
          <small>طلبات انضمام فاحصين</small>
        </div>
        <div className="inspector-stat-card">
          <span className="inspector-stat-icon"><FileText size={19} /></span>
          <span className="inspector-stat-label">تقارير مرفوعة</span>
          <strong>{formatArabicNumber(stats.reports)}</strong>
          <small>{formatArabicNumber(stats.media)} ملف وسائط</small>
        </div>
      </section>

      {/* ── Second Stats Row ── */}
      <section className="inspector-stats-grid">
        <div className="inspector-stat-card">
          <span className="inspector-stat-icon"><BadgeCheck size={19} /></span>
          <span className="inspector-stat-label">مكتملة</span>
          <strong>{formatArabicNumber(stats.completedInspections)}</strong>
        </div>
        <div className="inspector-stat-card">
          <span className="inspector-stat-icon"><Images size={19} /></span>
          <span className="inspector-stat-label">ملغاة</span>
          <strong>{formatArabicNumber(stats.cancelledInspections)}</strong>
        </div>
        <div className="inspector-stat-card">
          <span className="inspector-stat-icon"><Gavel size={19} /></span>
          <span className="inspector-stat-label">عروض معلّقة</span>
          <strong>{formatArabicNumber(stats.pendingOffers)}</strong>
          <small>من أصل {formatArabicNumber(stats.offers)} عرض</small>
        </div>
        <div className="inspector-stat-card">
          <span className="inspector-stat-icon"><Flag size={19} /></span>
          <span className="inspector-stat-label">معلَّم للمراجعة</span>
          <strong>{formatArabicNumber(stats.flaggedInspections)}</strong>
          <small>يحتاج قرارًا إداريًا</small>
        </div>
      </section>

      {/* ── Privacy Notice ── */}
      <div className="inspector-notice">
        <span><ShieldCheck size={18} /></span>
        <p><strong>خصوصية البيانات.</strong> بيانات العملاء وعناوين المركبات محمية. الوصول إليها يُسجَّل في سجل التدقيق.</p>
      </div>

      {/* ── Latest Requests + Side Panel ── */}
      <div className="inspector-main-grid">
        <div className="inspector-panel" style={{ padding: 19 }}>
          <div className="inspector-requests-heading">
            <div>
              <span className="inspector-section-kicker"><CarFront size={14} /> آخر النشاط</span>
              <h2>آخر الطلبات</h2>
            </div>
            <Link href="/admin/inspections" className="inspector-section-count">
              عرض الكل <ArrowLeft size={12} className="inline" />
            </Link>
          </div>

          {inspections.length === 0 ? (
            <div className="inspector-empty-state">
              <span><CarFront size={23} /></span>
              <h3>لا توجد طلبات فحص بعد</h3>
              <p>ستظهر الطلبات الجديدة هنا فور إنشائها.</p>
            </div>
          ) : (
            <ul className="divide-y divide-[#edf0f3]">
              {inspections.slice(0, 6).map((inspection) => {
                const meta = statusOf(inspection.status)
                const annotation = annotations.get(inspection.id)
                return (
                  <li key={inspection.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-[#102444]">
                        {inspection.vehicle.make} {inspection.vehicle.model}
                        <span className="mr-1.5 text-[10px] font-normal text-[#65768d]">{inspection.vehicle.year}</span>
                      </p>
                      <p className="mt-0.5 text-[10px] text-[#65768d]">
                        {inspection.city} · {nameById.get(inspection.customerId) ?? '—'} · {formatArabicDate(inspection.createdAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {annotation?.decision === 'flagged' && (
                        <span className="inspector-request-status" style={{ borderColor: '#f43f5e55', background: '#f43f5e12', color: '#e11d48' }}>
                          <Flag size={10} /> معلَّم
                        </span>
                      )}
                      <span className="inspector-request-status">{meta.label}</span>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <aside className="inspector-side-card">
          <span className="inspector-side-card-icon"><Clock3 size={20} /></span>
          <h2>يحتاج انتباهك</h2>
          <p>عناصر معلّقة تنتظر قرارًا إداريًا.</p>
          {attention.length === 0 ? (
            <div className="inspector-empty-state" style={{ minHeight: 120 }}>
              <h3>لا شيء معلّقًا الآن</h3>
              <p>كل الطلبات مُعالجة.</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {attention.map((item) => (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    className="flex items-center gap-2.5 rounded-lg bg-slate-50 px-3 py-2.5 transition-colors hover:bg-slate-100"
                  >
                    <span className="text-sky-600">{item.icon}</span>
                    <span className="flex-1 text-[11px] text-[#475d78]">{item.label}</span>
                    <span className="text-xs font-medium text-[#102244]">{formatArabicNumber(item.value)}</span>
                    <ArrowLeft size={12} className="text-[#8592a1]" />
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 rounded-lg border border-[#e3eaf2] bg-white p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-xs font-medium text-[#102244]">بث الأحداث</h3>
              <LiveRefresh />
            </div>
            {recentAudit.length === 0 ? (
              <p className="py-6 text-center text-[10px] text-[#65768d]">لا توجد أحداث مسجّلة بعد.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {recentAudit.map((event) => (
                  <li key={event.id} className="flex items-center gap-2">
                    <span className={`inspector-request-status ${auditEventTone(event.event_type) === 'warn' ? '' : ''}`}>
                      {auditEventLabel(event.event_type)}
                    </span>
                    <span className="truncate text-[10px] text-[#65768d]">
                      {event.actor_id ? (nameById.get(event.actor_id) ?? '—') : 'النظام'}
                    </span>
                    <time dir="ltr" className="mr-auto shrink-0 text-[10px] text-[#8592a1]">
                      {formatArabicDate(event.created_at, { timeStyle: 'short', dateStyle: 'short' })}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>

      {/* ── Quick Summary Cards ── */}
      <div className="inspector-stats-grid">
        <div className="inspector-stat-card">
          <span className="inspector-stat-icon"><UsersRound size={19} /></span>
          <span className="inspector-stat-label">المستخدمون</span>
          <strong>{formatArabicNumber(stats.users)}</strong>
        </div>
        <div className="inspector-stat-card">
          <span className="inspector-stat-icon"><BadgeCheck size={19} /></span>
          <span className="inspector-stat-label">الفاحصون المعتمدون</span>
          <strong>{formatArabicNumber(stats.inspectors)}</strong>
        </div>
        <div className="inspector-stat-card">
          <span className="inspector-stat-icon"><FileText size={19} /></span>
          <span className="inspector-stat-label">التقارير</span>
          <strong>{formatArabicNumber(stats.reports)}</strong>
        </div>
        <div className="inspector-stat-card">
          <span className="inspector-stat-icon"><Images size={19} /></span>
          <span className="inspector-stat-label">ملفات الوسائط</span>
          <strong>{formatArabicNumber(stats.media)}</strong>
        </div>
      </div>

      <footer className="inspector-footer">
        فاحص · لوحة الإدارة <span>بيانات العملاء وعناوين المركبات محمية.</span>
      </footer>
    </div>
  )
}
