import { AuditTable } from '@/components/admin/audit-table'
import { requireAdminPage } from '@/lib/admin/rbac'
import { listAuditEventTypes, listAuditEvents } from '@/lib/admin/store'
import { listUsers } from '@/lib/user-store'

export const dynamic = 'force-dynamic'

export default async function AdminAuditLogsPage() {
  await requireAdminPage()

  const [events, types, users] = await Promise.all([
    listAuditEvents({ limit: 300 }),
    listAuditEventTypes(),
    listUsers(),
  ])

  // A plain object, not a Map: it crosses the server/client boundary.
  const nameById = Object.fromEntries(users.map((user) => [user.id, user.name]))

  return (
    <div className="flex flex-col gap-4">
      <AuditTable events={events} nameById={nameById} types={types} />
      <p className="admin-footnote">
        الجدول مُلزَم على مستوى قاعدة البيانات برفض أي تعديل أو حذف (مُشغّل يمنع <code>UPDATE</code> و
        <code>DELETE</code>)، لذلك ما تراه سجل دائم لما حدث فعلًا — حتى حساب الخدمة لا يستطيع تغييره.
      </p>
    </div>
  )
}
