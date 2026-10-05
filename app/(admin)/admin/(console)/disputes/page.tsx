import { requireAdminPage } from '@/lib/admin/rbac'
import { listDisputes, type Dispute } from '@/lib/admin/extended-store'
import { DisputesTable } from '@/components/admin/disputes-table'
import { GlassPanel, EmptyState, Notice } from '@/components/admin/ui/glass'
import { Scale, DollarSign, Clock, CheckCircle2 } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function AdminDisputesPage() {
  await requireAdminPage()

  const { disputes, migrationPending } = await listDisputes()

  const open = disputes.filter((d) => d.status === 'open').length
  const review = disputes.filter((d) => d.status === 'under_review').length
  const resolved = disputes.filter((d) => d.status === 'resolved' || d.status === 'approved').length
  const totalRefund = disputes
    .filter((d) => d.status === 'approved' || d.status === 'resolved')
    .reduce((sum, d) => sum + d.refund_amount, 0)

  return (
    <div className="flex flex-col gap-4">
      {migrationPending && (
        <Notice tone="warn" title="الترحيل معلَّق">
          جدول <code className="admin-code">disputes</code> غير موجود. طبّق ترحيل الـ40 وحدة.
        </Notice>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <GlassPanel className="p-4">
          <div className="flex items-center gap-2 text-[#65768d]">
            <Scale size={15} />
            <span className="text-[11px]">نزاعات مفتوحة</span>
          </div>
          <p className="mt-2 text-2xl font-semibold text-rose-600">{open}</p>
        </GlassPanel>
        <GlassPanel className="p-4">
          <div className="flex items-center gap-2 text-[#65768d]">
            <Clock size={15} />
            <span className="text-[11px]">قيد المراجعة</span>
          </div>
          <p className="mt-2 text-2xl font-semibold text-amber-600">{review}</p>
        </GlassPanel>
        <GlassPanel className="p-4">
          <div className="flex items-center gap-2 text-[#65768d]">
            <CheckCircle2 size={15} />
            <span className="text-[11px]">محلولة</span>
          </div>
          <p className="mt-2 text-2xl font-semibold text-emerald-600">{resolved}</p>
        </GlassPanel>
        <GlassPanel className="p-4">
          <div className="flex items-center gap-2 text-[#65768d]">
            <DollarSign size={15} />
            <span className="text-[11px]">إجمالي الاسترداد</span>
          </div>
          <p className="mt-2 text-2xl font-semibold text-[#102444]">¥{totalRefund.toFixed(2)}</p>
        </GlassPanel>
      </div>

      {disputes.length === 0 ? (
        <EmptyState>لا نزاعات حاليًا</EmptyState>
      ) : (
        <DisputesTable disputes={disputes} />
      )}

      <p className="admin-footnote">
        النزاعات تُنشأ من تقارير الفحص. الاسترداد الجزئي مدعوم عبر حقل <code className="admin-code">refund_amount</code>.
        الأدلة تُخزَّن كروابط في <code className="admin-code">evidence_urls</code>.
      </p>
    </div>
  )
}
