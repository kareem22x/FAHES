import { requireAdminPage } from '@/lib/admin/rbac'
import { listAllInspections } from '@/lib/admin/store'
import { listInspectionReports } from '@/lib/admin/extended-store'
import { GlassPanel, GlassCard, GlassBadge, EmptyState } from '@/components/admin/ui/glass'
import { FileText, Download, Archive } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function AdminReportsPage() {
  await requireAdminPage()

  const [reports, inspections] = await Promise.all([
    listInspectionReports(200),
    listAllInspections(),
  ])

  const completed = inspections.filter((i) => i.status === 'completed')
  const withReport = reports.length
  const withoutReport = completed.length - withReport

  // Build a map for quick lookup
  const reportByInspection = new Map(reports.map((r) => [r.inspection_id, r]))

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <GlassPanel className="p-4">
          <div className="flex items-center gap-2 text-[#65768d]">
            <FileText size={15} />
            <span className="text-[11px]">تقارير منشأة</span>
          </div>
          <p className="mt-2 text-2xl font-semibold text-[#102444]">{withReport}</p>
        </GlassPanel>
        <GlassPanel className="p-4">
          <div className="flex items-center gap-2 text-[#65768d]">
            <Archive size={15} />
            <span className="text-[11px]">فحوصات مكتملة</span>
          </div>
          <p className="mt-2 text-2xl font-semibold text-emerald-600">{completed.length}</p>
        </GlassPanel>
        <GlassPanel className="p-4">
          <div className="flex items-center gap-2 text-[#65768d]">
            <FileText size={15} />
            <span className="text-[11px]">بدون تقرير</span>
          </div>
          <p className="mt-2 text-2xl font-semibold text-amber-600">{Math.max(0, withoutReport)}</p>
        </GlassPanel>
        <GlassPanel className="p-4">
          <div className="flex items-center gap-2 text-[#65768d]">
            <Archive size={15} />
            <span className="text-[11px]">نسبة التغطية</span>
          </div>
          <p className="mt-2 text-2xl font-semibold text-sky-600">
            {completed.length > 0 ? Math.round((withReport / completed.length) * 100) : 0}%
          </p>
        </GlassPanel>
      </div>

      <GlassCard title="ملفات التقارير">
        {completed.length === 0 ? (
          <EmptyState>لا فحوصات مكتملة بعد</EmptyState>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>رقم الطلب</th>
                  <th>المركبة</th>
                  <th>الفاحص</th>
                  <th>المدينة</th>
                  <th>التاريخ</th>
                  <th>التقرير</th>
                  <th>إجراء</th>
                </tr>
              </thead>
              <tbody>
                {completed.slice(0, 100).map((inspection) => {
                  const report = reportByInspection.get(inspection.id)
                  const inspectorName = inspection.offers.find(
                    (offer) => offer.id === inspection.acceptedOfferId,
                  )?.inspectorName
                  return (
                    <tr key={inspection.id}>
                      <td className="font-medium text-[#102444]">{inspection.id}</td>
                      <td className="text-xs text-[#475d78]">
                        {inspection.vehicle.make} {inspection.vehicle.model}
                      </td>
                      <td className="text-xs text-[#65768d]">{inspectorName || '—'}</td>
                      <td className="text-xs text-[#65768d]">{inspection.city}</td>
                      <td className="text-[10px] text-[#65768d]">
                        {new Date(inspection.createdAt).toLocaleDateString('ar-SA', { dateStyle: 'short' })}
                      </td>
                      <td>
                        {report ? (
                          <GlassBadge tone="good">منشئ</GlassBadge>
                        ) : (
                          <GlassBadge tone="warn">غير منشئ</GlassBadge>
                        )}
                      </td>
                      <td>
                        {report ? (
                          <a
                            href={`/api/reports/${inspection.id}`}
                            className="admin-btn admin-btn-sm"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Download size={12} /> عرض
                          </a>
                        ) : (
                          <span className="text-[10px] text-[#94a3b8]">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      <p className="admin-footnote">
        التقارير تُخزَّن في جدول <code className="admin-code">inspection_reports</code> كـJSON.
        الفحوصات القديمة تُؤرشف في <code className="admin-code">archived_inspections</code> للحفاظ على سرعة الاستعلام.
      </p>
    </div>
  )
}
