import { notFound } from 'next/navigation'
import { requirePhoneVerified, requireSession } from '@/lib/auth'
import { getTicketForRequester, listMessages } from '@/lib/support/store'
import TicketThread from '@/components/support/ticket-thread'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'تذكرة دعم · فاحص',
  robots: { index: false, follow: false },
}

export default async function SupportTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession()
  await requirePhoneVerified(session)

  const { id } = await params
  const ticket = await getTicketForRequester(id, session.sub)
  if (!ticket) notFound()

  const messages = await listMessages(id, false)

  return (
    <main dir="rtl" className="mx-auto w-full max-w-3xl px-4 py-8">
      <TicketThread ticket={ticket} initialMessages={messages} />
    </main>
  )
}
