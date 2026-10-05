import { requirePhoneVerified, requireSession } from '@/lib/auth'
import { listTicketsForRequester } from '@/lib/support/store'
import TicketsPanel from '@/components/support/tickets-panel'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'تذاكر الدعم الفني · فاحص',
  robots: { index: false, follow: false },
}

export default async function SupportTicketsPage() {
  const session = await requireSession()
  await requirePhoneVerified(session)
  const tickets = await listTicketsForRequester(session.sub)

  return (
    <main dir="rtl" className="mx-auto w-full max-w-3xl px-4 py-8">
      <TicketsPanel tickets={tickets} />
    </main>
  )
}
