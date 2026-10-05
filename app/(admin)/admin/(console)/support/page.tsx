import { requireAdminPage } from '@/lib/admin/rbac'
import { computeSupportStats, listTicketsForAdmin } from '@/lib/support/store'
import SupportConsole from '@/components/admin/support-console'

export const dynamic = 'force-dynamic'

export default async function AdminSupportPage() {
  await requireAdminPage()

  const tickets = await listTicketsForAdmin({})
  const stats = computeSupportStats(tickets)

  return <SupportConsole tickets={tickets} stats={stats} />
}
