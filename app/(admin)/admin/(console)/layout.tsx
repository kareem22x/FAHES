import { AdminShell } from '@/components/admin/admin-shell'
import { requireAdminPage, tierOf } from '@/lib/admin/rbac'
import { adminOverview } from '@/lib/admin/store'
import { getUserById } from '@/lib/user-store'

export const dynamic = 'force-dynamic'

/**
 * The guarded console shell.
 *
 * Note the extra `(console)` route group: the access-code gate lives at
 * `/admin/gate`, and it must NOT be wrapped by this layout — `admin_pending`
 * users are redirected here from the guard, so wrapping the gate in the guard
 * would produce an infinite redirect. Route groups let both live under
 * `/admin/*` with different layouts and identical URLs.
 */
export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdminPage()
  const [user, stats] = await Promise.all([getUserById(session.sub), adminOverview()])

  return (
    <AdminShell
      tier={tierOf(session)}
      adminName={user?.name ?? 'مدير'}
      quickStats={{
        users: stats.users,
        openInspections: stats.openInspections,
        pendingInspectors: stats.pendingInspectors,
        flagged: stats.flaggedInspections,
      }}
    >
      {children}
    </AdminShell>
  )
}
