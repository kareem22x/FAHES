import { requireAdminPage } from '@/lib/admin/rbac'
import { getAnalyticsSummary, type AnalyticsSummary } from '@/lib/admin/extended-store'
import { GlassPanel, GlassCard, GlassBadge, EmptyState, Notice } from '@/components/admin/ui/glass'
import { TrendingUp, Users, CarFront, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function AdminAnalyticsPage() {
  await requireAdminPage()

  let summary: AnalyticsSummary | null = null
  let error: string | null = null
  try {
    summary = await getAnalyticsSummary()
  } catch (e) {
    error = e instanceof Error ? e.message : 'خطأ غير معروف'
  }

  if (error || !summary) {
    return (
      <div className="flex flex-col gap-4">
        <Notice tone="bad" title="تعذّر تحميل التحليلات">
          {error}
        </Notice>
      </div>
    )
  }

  const kpis = [
    { label: 'إجمالي الفحوصات', value: summary.totalInspections, icon: CarFront, tone: 'neutral' as const },
    { label: 'نسبة الإكمال', value: `${summary.completedRate}%`, icon: CheckCircle2, tone: 'good' as const },
    { label: 'نسبة الإلغاء', value: `${summary.cancellationRate}%`, icon: XCircle, tone: 'bad' as const },
    { label: 'إجمالي المستخدمين', value: summary.totalUsers, icon: Users, tone: 'neutral' as const },
    { label: 'الفاحصون النشطون', value: summary.activeInspectors, icon: TrendingUp, tone: 'good' as const },
    { label: 'بانتظار الاعتماد', value: summary.pendingApprovals, icon: AlertTriangle, tone: 'warn' as const },
  ]

  const maxTrend = Math.max(...summary.inspectionTrend.map((t) => t.count), 1)
  const maxCity = Math.max(...summary.cityDistribution.map((c) => c.count), 1)

  return (
    <div className="flex flex-col gap-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {kpis.map((kpi) => (
          <GlassPanel key={kpi.label} className="p-4">
            <div className="flex items-center gap-2 text-[#65768d]">
              <kpi.icon size={15} />
              <span className="text-[11px]">{kpi.label}</span>
            </div>
            <p className="mt-2 text-2xl font-semibold text-[#102444]">{kpi.value}</p>
          </GlassPanel>
        ))}
      </div>

      {/* Alerts row */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <GlassPanel className="p-4">
          <p className="text-[11px] text-[#65768d]">مخالفات غير محلولة</p>
          <p className="mt-1 text-xl font-semibold text-rose-600">{summary.violationCount}</p>
        </GlassPanel>
        <GlassPanel className="p-4">
          <p className="text-[11px] text-[#65768d]">نزاعات مفتوحة</p>
          <p className="mt-1 text-xl font-semibold text-amber-600">{summary.openDisputes}</p>
        </GlassPanel>
        <GlassPanel className="p-4">
          <p className="text-[11px] text-[#65768d]">تذاكر دعم مفتوحة</p>
          <p className="mt-1 text-xl font-semibold text-sky-600">{summary.openTickets}</p>
        </GlassPanel>
      </div>

      {/* Trend chart */}
      <GlassCard title="اتجاه الفحوصات — آخر 14 يوم">
        {summary.inspectionTrend.length === 0 ? (
          <EmptyState>لا بيانات</EmptyState>
        ) : (
          <div className="flex items-end gap-1.5" style={{ height: '160px' }}>
            {summary.inspectionTrend.map((point) => {
              const barHeight = Math.max((point.count / maxTrend) * 100, 2)
              const completedHeight = maxTrend > 0 ? (point.completed / maxTrend) * 100 : 0
              return (
                <div key={point.date} className="flex flex-1 flex-col items-center gap-1">
                  <div className="relative flex w-full flex-1 items-end justify-center">
                    <div className="relative w-full max-w-[28px]" style={{ height: `${barHeight}%` }}>
                      <div className="absolute bottom-0 left-0 w-full rounded-t bg-sky-200" style={{ height: `${barHeight}%` }} />
                      <div className="absolute bottom-0 left-0 w-full rounded-t bg-sky-500" style={{ height: `${completedHeight}%` }} />
                    </div>
                  </div>
                  <span className="text-[9px] text-[#94a3b8]">{point.date.slice(5)}</span>
                </div>
              )
            })}
          </div>
        )}
        <div className="mt-3 flex gap-4 text-[10px] text-[#65768d]">
          <span className="flex items-center gap-1"><span className="inline-block size-2 rounded bg-sky-500" /> مكتمل</span>
          <span className="flex items-center gap-1"><span className="inline-block size-2 rounded bg-sky-200" /> إجمالي</span>
        </div>
      </GlassCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* City distribution */}
        <GlassCard title="التوزيع الجغرافي للفحوصات">
          {summary.cityDistribution.length === 0 ? (
            <EmptyState>لا بيانات</EmptyState>
          ) : (
            <div className="flex flex-col gap-2.5">
              {summary.cityDistribution.map((item) => (
                <div key={item.city} className="flex items-center gap-3">
                  <span className="w-20 text-xs text-[#475d78]">{item.city}</span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-l from-sky-400 to-sky-600"
                      style={{ width: `${(item.count / maxCity) * 100}%` }}
                    />
                  </div>
                  <span className="w-10 text-left text-xs font-medium text-[#102444]">{item.count}</span>
                </div>
              ))}
            </div>
          )}
        </GlassCard>

        {/* Inspector performance */}
        <GlassCard title="أداء الفاحصين — الأعلى فحصًا">
          {summary.inspectorPerformance.length === 0 ? (
            <EmptyState>لا بيانات — جدول إحصائيات الفاحصين لم يُطبّق بعد</EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>الفاحص</th>
                    <th>الإجمالي</th>
                    <th>المكتملة</th>
                    <th>التقييم</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.inspectorPerformance.map((insp) => (
                    <tr key={insp.name}>
                      <td className="font-medium text-[#102444]">{insp.name}</td>
                      <td>{insp.total}</td>
                      <td>{insp.completed}</td>
                      <td>
                        {insp.rating ? (
                          <GlassBadge tone={insp.rating >= 4 ? 'good' : insp.rating >= 3 ? 'warn' : 'bad'}>
                            {Number(insp.rating).toFixed(1)} ★
                          </GlassBadge>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  )
}
