import { notFound } from 'next/navigation'
import { requireAdminPage } from '@/lib/admin/rbac'
import { getCustomerRequests } from '@/lib/customer-data'
import { getUserById } from '@/lib/user-store'
import { getTicket, listCannedResponses, listEvents, listMessages } from '@/lib/support/store'
import { formatAccountAge, formatLastSeen } from '@/lib/relative-time'
import AdminTicketDetail from '@/components/admin/support-ticket-detail'

export const dynamic = 'force-dynamic'

export default async function AdminTicketPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage()

  const { id } = await params
  const ticket = await getTicket(id)
  if (!ticket) notFound()

  const [messages, events, canned, requester] = await Promise.all([
    listMessages(id, true),
    listEvents(id),
    listCannedResponses(),
    getUserById(ticket.requesterId),
  ])

  // Recent orders are a convenience for the agent, not a requirement — a failure
  // here must not take down the ticket they are trying to answer.
  let recentOrders: { id: string; label: string; status: string }[] = []
  try {
    const requests = await getCustomerRequests(ticket.requesterId)
    recentOrders = requests.slice(0, 5).map((request) => ({
      id: request.id,
      label: `${request.vehicle.make} ${request.vehicle.model} · ${request.city}`,
      status: request.status,
    }))
  } catch {
    recentOrders = []
  }

  // Resolved on the server, once, and shipped as plain strings. `Date.now()` is
  // deliberately not called here: reading the clock during a render is impure
  // (and the linter rejects it), and the browser recomputing the label could
  // land on the other side of a boundary ("أقل من يوم" vs "1 يوم"), which React
  // reports as a hydration mismatch. The default lives inside the helpers.
  return (
    <AdminTicketDetail
      ticket={ticket}
      messages={messages}
      events={events}
      canned={canned}
      requester={{
        name: requester?.name ?? '—',
        phone: requester?.phone ?? null,
        role: requester?.role ?? 'customer',
        verified: requester?.phoneVerified ?? false,
        accountAge: formatAccountAge(requester?.createdAt),
        lastSeen: formatLastSeen(requester?.lastLoginAt),
      }}
      recentOrders={recentOrders}
    />
  )
}
