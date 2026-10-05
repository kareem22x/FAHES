import { requireAdminPage } from '@/lib/admin/rbac'
import { listInspectorViolations, type InspectorViolation } from '@/lib/admin/extended-store'
import { ViolationsTable } from '@/components/admin/violations-table'
import { GlassPanel, EmptyState, Notice } from '@/components/admin/ui/glass'
import { AlertTriangle, ShieldAlert, CheckCircle2, Clock } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function AdminViolationsPage() {
  await requireAdminPage()

  const { violations, migrationPending } = await listInspectorViolations()

  const unresolved = violations.filter((v) => !v.resolved).length
  const critical = violations.filter((v) => v.severity === 'critical' && !v.resolved).length
  const high = violations.filter((v) => v.severity === 'high' && !v.resolved).length
  const resolved = violations.filter((v) => v.resolved).length

  return (
    <div className="flex flex-col gap-4">
      {migrationPending && (
        <Notice tone="warn" title="الترحيل معلَّق">
          جدول <code className="admin-code">inspector_violations</code> غير موجود. طبّق ترحيل الـ40 وحدة.
        </Notice>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <GlassPanel className="p-4">
          <div className="flex items-center gap-2 text-[#65768d]">
            <AlertTriangle size={15} />
            <span className="text-[11px]">غير محلولة</span>
          </div>
          <p className="mt-2 text-2xl font-semibold text-rose-600">{unresolved}</p>
        </GlassPanel>
        <GlassPanel className="p-4">
          <div className="flex items-center gap-2 text-[#65768d]">
            <ShieldAlert size={15} />
            <span className="text-[11px]">حرجة</span>
          </div>
          <p className="mt-2 text-2xl font-semibold text-rose-700">{critical}</p>
        </GlassPanel>
        <GlassPanel className="p-4">
          <div className="flex items-center gap-2 text-[#65768d]">
            <Clock size={15} />
            <span className="text-[11px]">عالية الخطورة</span>
          </div>
          <p className="mt-2 text-2xl font-semibold text-amber-600">{high}</p>
        </GlassPanel>
        <GlassPanel className="p-4">
          <div className="flex items-center gap-2 text-[#65768d]">
            <CheckCircle2 size={15} />
            <span className="text-[11px]">محلولة</span>
          </div>
          <p className="mt-2 text-2xl font-semibold text-emerald-600">{resolved}</p>
        </GlassPanel>
      </div>

      {violations.length === 0 ? (
        <EmptyState>لا مخالفات مسجّلة</EmptyState>
      ) : (
        <ViolationsTable violations={violations} />
      )}

      <p className="admin-footnote">
        التصنيفات: <code className="admin-code">fake_gps</code> موقع مزيف ·
        <code className="admin-code"> tardiness</code> تأخّر ·
        <code className="admin-code"> unexcused_cancel</code> إلغاء بلا عذر ·
        <code className="admin-code"> zone_breach</code> تجاوز منطقة ·
        <code className="admin-code"> speed_anomaly</code> سرعة غير طبيعية ·
        <code className="admin-code"> photo_tamper</code> تلاعب بالصور.
        الكشف آلي عبر <code className="admin-code">upsert_inspector_location</code>.
      </p>
    </div>
  )
}
