import { NextRequest, NextResponse } from 'next/server'
import { requireVerifiedSession } from '@/lib/auth'
import { assertSameOrigin } from '@/lib/origin'
import { addMessage, getTicketForRequester, reopenTicket, type TicketRole } from '@/lib/support/store'

/**
 * Post a message into a ticket thread.
 *
 * A reply to a resolved/closed ticket inside the 48-hour window re-opens it
 * automatically (feature 38); outside the window the reply is still recorded, but
 * the ticket stays closed and the UI tells the user to open a new one.
 */

function roleOf(role: string): TicketRole {
  if (role === 'inspector') return 'inspector'
  if (role === 'admin') return 'admin'
  return 'customer'
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const originError = assertSameOrigin(request)
  if (originError) return originError

  const guard = await requireVerifiedSession()
  if (!guard.ok) return guard.response
  const session = guard.session

  const { id } = await params
  const ticket = await getTicketForRequester(id, session.sub)
  if (!ticket) return NextResponse.json({ error: 'التذكرة غير موجودة.' }, { status: 404 })

  const body = (await request.json().catch(() => null)) as {
    body?: unknown
    attachmentPath?: unknown
    attachmentName?: unknown
    attachmentMime?: unknown
    attachmentSize?: unknown
  } | null

  const text = typeof body?.body === 'string' ? body.body.trim() : ''
  const attachmentPath = typeof body?.attachmentPath === 'string' ? body.attachmentPath : null
  if (!text && !attachmentPath) {
    return NextResponse.json({ error: 'اكتب رسالة أو أرفق ملفًا.' }, { status: 400 })
  }

  const message = await addMessage({
    ticketId: id,
    authorId: session.sub,
    authorRole: roleOf(session.role),
    body: text,
    isInternal: false,
    attachmentPath,
    attachmentName: typeof body?.attachmentName === 'string' ? body.attachmentName : null,
    attachmentMime: typeof body?.attachmentMime === 'string' ? body.attachmentMime : null,
    attachmentSize: typeof body?.attachmentSize === 'number' ? body.attachmentSize : null,
  })

  if (!message) {
    return NextResponse.json({ error: 'نظام التذاكر غير مهيأ على الخادم حاليًا.' }, { status: 503 })
  }

  let reopened = false
  if (ticket.status === 'resolved' || ticket.status === 'closed') {
    const verdict = await reopenTicket(id, session.sub)
    reopened = verdict === 'ok'
  }

  return NextResponse.json({ ok: true, message, reopened }, { status: 201 })
}
