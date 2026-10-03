import { redirect } from 'next/navigation'
import { AdminGateForm } from '@/components/modules/admin/admin-gate-form'
import { dashboardPath, requireSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * Access-code gate for `admin_pending` sessions.
 *
 * Deliberately outside the `(console)` route group: the console layout redirects
 * here, so wrapping this page in that layout would loop. Owners never reach it —
 * `lib/admin/rbac.ts` treats them as permanently elevated.
 */
export default async function AdminGatePage() {
  const session = await requireSession()
  if (session.role === 'admin') redirect('/admin')
  // Anyone who is not awaiting elevation has nothing to do here. Resolve the
  // destination from the role rather than hard-coding `/dashboard`, so an
  // inspector does not get bounced through a customer route they cannot enter.
  if (session.role !== 'admin_pending') redirect(dashboardPath(session))
  return <AdminGateForm />
}
