import {
  InspectorApplicationsTable,
  type InspectorApplicationRowView,
} from '@/components/admin/inspector-applications-table'
import { Notice } from '@/components/admin/ui/glass'
import { requireAdminPage } from '@/lib/admin/rbac'
import {
  inspectorApplicationsTableExists,
  listInspectorApplications,
  listUsers,
} from '@/lib/user-store'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'طلبات التقديم كفاحص' }

/**
 * The inspector-applications inbox.
 *
 * Answers one question — «من ينتظر قرارًا؟» — and is therefore separate from
 * `/admin/inspectors`, which answers «من هو فاحص؟» and mixes approved accounts
 * with applicants.
 *
 * The guard is the console layout's `requireAdminPage()` plus the phone gate
 * applied in `app/(admin)/admin/(console)/layout.tsx`; this page adds no
 * authorization of its own, so it cannot drift from the rest of the console.
 */
export default async function AdminInspectorApplicationsPage() {
  await requireAdminPage()

  const [users, applications, tableReady] = await Promise.all([
    listUsers(),
    listInspectorApplications(),
    inspectorApplicationsTableExists(),
  ])

  const userById = new Map(users.map((user) => [user.id, user]))

  const rows: InspectorApplicationRowView[] = applications.map((application) => {
    const account = userById.get(application.user_id)
    return {
      id: application.user_id,
      userId: application.user_id,
      fullName: application.full_name || account?.name || 'بدون اسم',
      accountName: account?.name ?? '',
      nationalId: application.national_id,
      phone: application.phone ?? account?.phone ?? null,
      age: application.age,
      experienceYears: application.experience_years,
      experienceDetails: application.experience_details,
      hasCertificates: application.has_certificates,
      qualification: application.qualification,
      cities: application.cities ?? [],
      specialties: application.specialties ?? [],
      availability: application.availability,
      hasEquipment: application.has_equipment,
      notes: application.notes,
      submittedAt: application.submitted_at,
      inspectorStatus: account?.inspectorStatus ?? 'pending',
    }
  })

  const pending = rows.filter((row) => row.inspectorStatus === 'pending').length

  return (
    <div className="flex flex-col gap-4">
      {!tableReady && (
        <Notice tone="warn" title="جدول طلبات الفاحصين غير مُنشأ بعد">
          لم يُطبَّق ملف الترحيل{' '}
          <span dir="ltr">20261001000004_inspector_applications.sql</span> على قاعدة البيانات، لذلك لا
          يمكن استقبال الطلبات. شغّل ملف الترحيل لتفعيل هذه الصفحة.
        </Notice>
      )}

      <Notice tone="neutral" title={`${pending} طلب بانتظار المراجعة`}>
        تُعرض هنا بيانات التقديم كما أدخلها المتقدم — الاسم الثلاثي، رقم الهوية، الجوال، العمر،
        الخبرة والشهادات. الاعتماد يمنح الحساب دور <code>inspector</code> ويربط مدن التغطية من
        الطلب، وكل قرار يُسجَّل في سجل التدقيق.
      </Notice>

      <InspectorApplicationsTable rows={rows} />

      <p className="admin-footnote">
        الطلبات مرتّبة من الأحدث. الاعتماد والرفض يتمّان من الخادم بعد التحقق من جلسة المدير، ولا
        يمكن للمتقدم اعتماد نفسه.
      </p>
    </div>
  )
}
