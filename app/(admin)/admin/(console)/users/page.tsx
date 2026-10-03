import { UsersTable } from '@/components/admin/users-table'
import { isOwnerSession, requireAdminPage } from '@/lib/admin/rbac'
import { listUsersWithActivity } from '@/lib/admin/store'
import { isPlatformOwner } from '@/lib/user-store'

export const dynamic = 'force-dynamic'

export default async function AdminUsersPage() {
  const session = await requireAdminPage()
  const rows = await listUsersWithActivity()
  const ownerIds = rows
    .filter((row) => isPlatformOwner({ phone: row.phone, clerkUserId: row.clerkUserId }))
    .map((row) => row.id)

  return (
    <UsersTable
      rows={rows}
      isOwner={isOwnerSession(session)}
      currentUserId={session.sub}
      ownerIds={ownerIds}
    />
  )
}
