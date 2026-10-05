import { notFound } from 'next/navigation'
import { requireAdminPage } from '@/lib/admin/rbac'
import { getCustomerRequests } from '@/lib/customer-data'
import { getUserById } from '@/lib/user-store'
import { getTicket, listCannedResponses, listEvents, listMessages } from '@/lib/support/store'
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
      }}
      recentOrders={recentOrders}
    />
  )
}
