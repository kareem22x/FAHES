import { InspectorsTable, type InspectorRow } from '@/components/admin/inspectors-table'
import { Notice } from '@/components/admin/ui/glass'
import { requireAdminPage } from '@/lib/admin/rbac'
import { inspectorApplicationsTableExists, listInspectorApplications, listUsers } from '@/lib/user-store'

export const dynamic = 'force-dynamic'

export default async function AdminInspectorsPage() {
  await requireAdminPage()

  const [users, applications, applicationsTableReady] = await Promise.all([
    listUsers(),
    listInspectorApplications(),
    inspectorApplicationsTableExists(),
  ])
  const applicationByUser = new Map(applications.map((application) => [application.user_id, application]))

  const inspectors = users.filter((user) => user.inspectorStatus !== 'none' || user.role === 'inspector')

  const rows: InspectorRow[] = inspectors.map((user) => {
    const application = applicationByUser.get(user.id)
    return {
      id: user.id,
      name: user.name,
      phone: user.phone,
      role: user.role,
      inspectorStatus: user.inspectorStatus,
      experienceYears: application ? application.experience_years : null,
      availability: application?.availability ?? null,
      cities: application?.cities ?? user.inspectorProfile?.cities ?? [],
      specialties: application?.specialties ?? [],
      qualification: application?.qualification ?? null,
      hasEquipment: application ? application.has_equipment : null,
      notes: application?.notes ?? null,
      hasApplication: Boolean(application),
    }
  })

  return (
    <div className="flex flex-col gap-4">
      {!applicationsTableReady && (
        <Notice tone="warn" title="جدول طلبات الفاحصين غير مُنشأ بعد">
          لم يُطبَّق ملف الترحيل <span dir="ltr">20260930180200_inspector_applications.sql</span> على قاعدة البيانات، لذلك
          لا تظهر بيانات الاستبيان (الخبرة، المدن، التخصصات). الاعتماد والرفض يعملان، لكن المدن ستُؤخذ من ملف الفاحص
          بدل الاستبيان. شغّل ملف الترحيل لتفعيل البيانات الكاملة.
        </Notice>
      )}
      <InspectorsTable rows={rows} />
      <p className="text-[10px] leading-5 text-neutral-600">
        اعتماد الفاحص يمنحه دور <span dir="ltr">inspector</span> ويربط مدن التغطية من استبيان الطلب. الاعتماد يتم من
        الخادم بعد التحقق من جلسة المدير، وكل تغيير حالة يُسجَّل في سجل التدقيق.
      </p>
    </div>
  )
}
