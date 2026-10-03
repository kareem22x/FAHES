import Link from 'next/link'
import { ArrowLeft, BadgeCheck, CarFront, Clock3, FileText, Gavel, Flag, Images, UsersRound } from 'lucide-react'
import { GlassBadge, GlassCard, GlassPanel, EmptyState } from '@/components/admin/ui/glass'
import { KpiCard, KpiGrid } from '@/components/admin/kpi-cards'
import { LiveRefresh } from '@/components/admin/live-refresh'
import { activityTrend, adminOverview, listAuditEvents, listInspectionAnnotations, listAllInspections } from '@/lib/admin/store'
import { auditEventLabel, auditEventTone } from '@/lib/admin/labels'
import { formatArabicDate, formatArabicNumber, statusOf } from '@/lib/inspection-status'
import { listUsers } from '@/lib/user-store'

export const dynamic = 'force-dynamic'

const statusTone = {
  done: 'good',
  cancelled: 'bad',
  progress: 'neutral',
  open: 'warn',
} as const

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
      <KpiGrid>
        <KpiCard label="إجمالي المستخدمين" value={stats.users} tone="sky" trend={{ points: trend, key: 'users' }} hint={`${formatArabicNumber(stats.customers)} عميل · ${formatArabicNumber(stats.inspectors)} فاحص`} />
        <KpiCard label="طلبات الفحص" value={stats.inspections} tone="violet" trend={{ points: trend, key: 'inspections' }} hint={`${formatArabicNumber(stats.activeInspections)} قيد التنفيذ`} />
        <KpiCard label="بانتظار الاعتماد" value={stats.pendingInspectors} tone="amber" hint="طلبات انضمام فاحصين" />
        <KpiCard label="تقارير مرفوعة" value={stats.reports} tone="emerald" hint={`${formatArabicNumber(stats.media)} ملف وسائط`} />
      </KpiGrid>

      <KpiGrid>
        <KpiCard label="مكتملة" value={stats.completedInspections} tone="emerald" />
        <KpiCard label="ملغاة" value={stats.cancelledInspections} tone="rose" />
        <KpiCard label="عروض معلّقة" value={stats.pendingOffers} tone="amber" hint={`من أصل ${formatArabicNumber(stats.offers)} عرض`} />
        <KpiCard label="معلَّم للمراجعة" value={stats.flaggedInspections} tone="rose" hint="يحتاج قرارًا إداريًا" />
      </KpiGrid>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <GlassCard
          title="آخر الطلبات"
          hint={
            <Link href="/admin/inspections" className="flex items-center gap-1 text-[11px] text-sky-400 hover:text-sky-300">
              عرض الكل <ArrowLeft className="size-3" />
            </Link>
          }
        >
          {inspections.length === 0 ? (
            <EmptyState>لا توجد طلبات فحص بعد.</EmptyState>
          ) : (
            <ul className="divide-y divide-white/5">
              {inspections.slice(0, 6).map((inspection) => {
                const meta = statusOf(inspection.status)
                const annotation = annotations.get(inspection.id)
                return (
                  <li key={inspection.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-neutral-200">
                        {inspection.vehicle.make} {inspection.vehicle.model}
                        <span className="mr-1.5 text-[10px] font-normal text-neutral-500">{inspection.vehicle.year}</span>
                      </p>
                      <p className="mt-0.5 text-[10px] text-neutral-500">
                        {inspection.city} · {nameById.get(inspection.customerId) ?? '—'} · {formatArabicDate(inspection.createdAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {annotation?.decision === 'flagged' && (
                        <GlassBadge tone="warn">
                          <Flag className="size-2.5" /> معلَّم
                        </GlassBadge>
                      )}
                      <GlassBadge tone={statusTone[meta.tone]}>{meta.label}</GlassBadge>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </GlassCard>

        <div className="flex flex-col gap-4">
          <GlassCard title="يحتاج انتباهك">
            {attention.length === 0 ? (
              <EmptyState>لا شيء معلّقًا الآن — كل الطلبات مُعالجة.</EmptyState>
            ) : (
              <ul className="flex flex-col gap-2 stagger-on-view">
                {attention.map((item) => (
                  <li key={item.label}>
                    <Link
                      href={item.href}
                      className="flex items-center gap-2.5 rounded-lg bg-white/[.03] px-3 py-2.5 transition-colors hover:bg-white/[.07]"
                    >
                      <span className="text-sky-400">{item.icon}</span>
                      <span className="flex-1 text-[11px] text-neutral-300">{item.label}</span>
                      <span className="text-xs font-medium text-white">{formatArabicNumber(item.value)}</span>
                      <ArrowLeft className="size-3 text-neutral-600" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </GlassCard>

          <GlassPanel className="p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-sm font-medium text-neutral-100">بث الأحداث</h2>
              <LiveRefresh />
            </div>
            {recentAudit.length === 0 ? (
              <EmptyState>لا توجد أحداث مسجّلة بعد.</EmptyState>
            ) : (
              <ul className="flex flex-col gap-2">
                {recentAudit.map((event) => (
                  <li key={event.id} className="flex items-center gap-2">
                    <GlassBadge tone={auditEventTone(event.event_type)}>{auditEventLabel(event.event_type)}</GlassBadge>
                    <span className="truncate text-[10px] text-neutral-500">
                      {event.actor_id ? (nameById.get(event.actor_id) ?? '—') : 'النظام'}
                    </span>
                    <time dir="ltr" className="mr-auto shrink-0 text-[10px] text-neutral-600">
                      {formatArabicDate(event.created_at, { timeStyle: 'short', dateStyle: 'short' })}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </GlassPanel>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { icon: <UsersRound className="size-4" />, label: 'المستخدمون', value: stats.users },
          { icon: <BadgeCheck className="size-4" />, label: 'الفاحصون المعتمدون', value: stats.inspectors },
          { icon: <FileText className="size-4" />, label: 'التقارير', value: stats.reports },
          { icon: <Images className="size-4" />, label: 'ملفات الوسائط', value: stats.media },
        ].map((item) => (
          <GlassPanel key={item.label} className="flex items-center gap-3 p-4">
            <span className="text-sky-400">{item.icon}</span>
            <span className="flex-1 text-[11px] text-neutral-400">{item.label}</span>
            <strong className="text-sm font-medium text-white">{formatArabicNumber(item.value)}</strong>
          </GlassPanel>
        ))}
      </div>
    </div>
  )
}
