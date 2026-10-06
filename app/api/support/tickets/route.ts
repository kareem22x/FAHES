import { NextRequest, NextResponse } from 'next/server'
import { requireVerifiedSession } from '@/lib/auth'
import { getClientIp } from '@/lib/client-ip'
import { assertSameOrigin } from '@/lib/origin'
import { consumeRateLimit } from '@/lib/rate-limit'
import {
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  createTicket,
  listTicketsForRequester,
  type TicketCategory,
  type TicketPriority,
  type TicketRole,
} from '@/lib/support/store'

/** The requester-facing ticket collection: list mine, open a new one. */

function roleOf(role: string): TicketRole {
  if (role === 'inspector') return 'inspector'
  if (role === 'admin') return 'admin'
  return 'customer'
}

export async function GET() {
  const guard = await requireVerifiedSession()
  if (!guard.ok) return guard.response
  const tickets = await listTicketsForRequester(guard.session.sub)
  return NextResponse.json({ tickets })
}

export async function POST(request: NextRequest) {
  const originError = assertSameOrigin(request)
  if (originError) return originError

  const guard = await requireVerifiedSession()
  if (!guard.ok) return guard.response
  const session = guard.session

  try {
    const ip = getClientIp(request)
    const [byUser, byIp] = await Promise.all([
      consumeRateLimit(`ticket:create:user:${session.sub}`, 10, 60 * 60_000),
      consumeRateLimit(`ticket:create:ip:${ip}`, 30, 60 * 60_000),
    ])
    if (!byUser.ok || !byIp.ok) {
      return NextResponse.json(
        { error: 'أنشأت عددًا كبيرًا من التذاكر. حاول لاحقًا.', reason: 'rate_limited' },
        { status: 429 },
      )
    }
  } catch {
    // Throttling is best-effort; a legitimate ticket must not be blocked by it.
  }

  const body = (await request.json().catch(() => null)) as {
    subject?: unknown
    category?: unknown
    priority?: unknown
    body?: unknown
    inspectionId?: unknown
    deviceInfo?: unknown
    latitude?: unknown
    longitude?: unknown
  } | null

  const subject = typeof body?.subject === 'string' ? body.subject : ''
  const description = typeof body?.body === 'string' ? body.body : ''
  const category = TICKET_CATEGORIES.includes(body?.category as TicketCategory)
    ? (body?.category as TicketCategory)
    : 'other'
  const priority = TICKET_PRIORITIES.includes(body?.priority as TicketPriority)
    ? (body?.priority as TicketPriority)
    : 'medium'

  const deviceInfo =
    body?.deviceInfo && typeof body.deviceInfo === 'object' ? (body.deviceInfo as Record<string, unknown>) : {}
  const latitude = typeof body?.latitude === 'number' ? body.latitude : null
  const longitude = typeof body?.longitude === 'number' ? body.longitude : null
  const inspectionId = typeof body?.inspectionId === 'string' && body.inspectionId ? body.inspectionId : null

  const result = await createTicket({
    requesterId: session.sub,
    requesterRole: roleOf(session.role),
    subject,
    category,
    priority,
    body: description,
    inspectionId,
    deviceInfo,
    latitude,
    longitude,
  })

  if (!result.ok) {
    if (result.reason === 'invalid') {
      return NextResponse.json({ error: 'أدخل عنوانًا لا يقل عن ٣ أحرف ووصفًا للمشكلة.' }, { status: 400 })
    }
    return NextResponse.json(
      { error: 'نظام التذاكر غير مهيأ على الخادم حاليًا. تواصل مع الدعم مباشرة.', reason: 'unavailable' },
      { status: 503 },
    )
  }

  return NextResponse.json({ ok: true, ticket: result.ticket }, { status: 201 })
}
