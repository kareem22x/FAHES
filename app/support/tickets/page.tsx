import { requirePhoneVerified, requireSession } from '@/lib/auth'
import { listTicketsForRequester } from '@/lib/support/store'
import TicketsPanel from '@/components/support/tickets-panel'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'تذاكر الدعم الفني · فاحص',
  robots: { index: false, follow: false },
}

/**
 * The page no longer wraps itself in a container: `app/support/layout.tsx`
 * provides the product shell (sidebar, topbar, `.app-content`), exactly as the
 * customer dashboard's layout does. A second `max-w-3xl` wrapper here would
 * double the page gutter and cap the KPI row at a third of the screen.
 */
export default async function SupportTicketsPage() {
  const session = await requireSession()
  await requirePhoneVerified(session)
  const tickets = await listTicketsForRequester(session.sub)

  return <TicketsPanel tickets={tickets} />
}
