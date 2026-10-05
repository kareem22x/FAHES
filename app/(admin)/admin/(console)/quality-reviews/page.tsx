import { requireAdminPage } from '@/lib/admin/rbac'
import { listInspectionAudits, type InspectionAudit } from '@/lib/admin/extended-store'
import { QualityReviewsTable } from '@/components/admin/quality-reviews-table'
import { GlassPanel, EmptyState, Notice } from '@/components/admin/ui/glass'
import { ClipboardCheck, Clock, CheckCircle2, AlertCircle } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function AdminQualityReviewsPage() {
  await requireAdminPage()

  const { audits, migrationPending } = await listInspectionAudits()

  const pending = audits.filter((a) => a.status === 'pending').length
  const passed = audits.filter((a) => a.status === 'passed').length
  const flagged = audits.filter((a) => a.status === 'flagged_for_fix').length
  const rejected = audits.filter((a) => a.status === 'rejected').length

  return (
    <div className="flex flex-col gap-4">
      {migrationPending && (
        <Notice tone="warn" title="الترحيل معلَّق">
          جدول <code className="admin-code">inspection_audits</code> غير موجود. طبّق ترحيل الـ40 وحدة.
        </Notice>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <GlassPanel className="p-4">
          <div className="flex items-center gap-2 text-[#65768d]">
            <Clock size={15} />
            <span className="text-[11px]">بانتظار المراجعة</span>
          </div>
          <p className="mt-2 text-2xl font-semibold text-amber-600">{pending}</p>
        </GlassPanel>
        <GlassPanel className="p-4">
          <div className="flex items-center gap-2 text-[#65768d]">
            <CheckCircle2 size={15} />
            <span className="text-[11px]">مقبولة</span>
          </div>
          <p className="mt-2 text-2xl font-semibold text-emerald-600">{passed}</p>
        </GlassPanel>
        <GlassPanel className="p-4">
          <div className="flex items-center gap-2 text-[#65768d]">
            <AlertCircle size={15} />
            <span className="text-[11px]">تحتاج تعديل</span>
          </div>
          <p className="mt-2 text-2xl font-semibold text-rose-600">{flagged}</p>
        </GlassPanel>
        <GlassPanel className="p-4">
          <div className="flex items-center gap-2 text-[#65768d]">
            <ClipboardCheck size={15} />
            <span className="text-[11px]">مرفوضة</span>
          </div>
          <p className="mt-2 text-2xl font-semibold text-rose-700">{rejected}</p>
        </GlassPanel>
      </div>

      {audits.length === 0 ? (
        <EmptyState>لا مراجعات جودة في الطابور</EmptyState>
      ) : (
        <QualityReviewsTable audits={audits} />
      )}

      <p className="admin-footnote">
        تُحال <strong>10%</strong> من التقارير المكتملة لمراجعة بشرية تلقائيًا عبر دالة
        <code className="admin-code"> queue_inspection_audit</code>. النسبة قابلة للتعديل من
        <code className="admin-code"> system_settings</code> مفتاح <code className="admin-code">audit_sample_rate</code>.
      </p>
    </div>
  )
}
