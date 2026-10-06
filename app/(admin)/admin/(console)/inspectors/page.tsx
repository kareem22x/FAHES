import Link from 'next/link'
import { InspectorsTable } from '@/components/admin/inspectors-table'
import { Notice } from '@/components/admin/ui/glass'
import { requireAdminPage } from '@/lib/admin/rbac'
import { buildInspectorRoster } from '@/lib/inspector-roster'
import { inspectorApplicationsTableExists, listInspectorApplications, listUsers } from '@/lib/user-store'

export const dynamic = 'force-dynamic'

/**
 * The inspector roster: accounts a decision has already been taken on.
 *
 * Membership is decided by `buildInspectorRoster` rather than here, because a
 * rule written inside a `force-dynamic` page is a rule nothing can test — see
 * `lib/inspector-roster.ts` for why admins and pending applicants are excluded.
 */
export default async function AdminInspectorsPage() {
  await requireAdminPage()

  const [users, applications, applicationsTableReady] = await Promise.all([
    listUsers(),
    listInspectorApplications(),
    inspectorApplicationsTableExists(),
  ])

  const rows = buildInspectorRoster(users, applications)

  return (
    <div className="flex flex-col gap-4">
      {!applicationsTableReady && (
        <Notice tone="warn" title="جدول طلبات الفاحصين غير مُنشأ بعد">
          لم يُطبَّق ملف الترحيل <span dir="ltr">20261001000004_inspector_applications.sql</span> على قاعدة البيانات،
          لذلك لا تظهر بيانات الاستبيان (الخبرة، المدن، التخصصات). الاعتماد والرفض يعملان، لكن المدن ستُؤخذ من ملف
          الفاحص بدل الاستبيان. شغّل ملف الترحيل لتفعيل البيانات الكاملة.
        </Notice>
      )}

      <InspectorsTable rows={rows} />

      <p className="admin-footnote">
        هذه القائمة تعرض الحسابات التي صدر بحقها قرار (معتمد · مرفوض · موقوف). الطلبات الجديدة التي لم يُبتّ فيها
        بعد في <Link href="/admin/inspector-applications">طلبات التقديم</Link>. الاعتماد يمنح دور{' '}
        <code>inspector</code> ويربط مدن التغطية من استبيان الطلب، و«إزالة» تعيد الحساب إلى عميل وتخرجه من هذه
        القائمة دون حذف طلبه. كل تغيير حالة يُسجَّل في سجل التدقيق.
      </p>
    </div>
  )
}
