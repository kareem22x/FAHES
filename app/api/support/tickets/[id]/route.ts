import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { assertSameOrigin } from '@/lib/origin'
import { getTicketForRequester, listEvents, listMessages, rateTicket } from '@/lib/support/store'

/**
 * A single ticket, scoped to its requester.
 *
 * `getTicketForRequester` returns null both for "does not exist" and for "belongs
 * to someone else", and the handler answers 404 for both. Distinguishing them
 * would let an attacker enumerate other users' ticket ids.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'سجّل الدخول أولًا.' }, { status: 401 })

  const { id } = await params
  const ticket = await getTicketForRequester(id, session.sub)
  if (!ticket) return NextResponse.json({ error: 'التذكرة غير موجودة.' }, { status: 404 })

  const [messages, events] = await Promise.all([listMessages(id, false), listEvents(id)])
  return NextResponse.json({ ticket, messages, events })
}

/** CSAT feedback — the 1–5 star prompt shown right after resolution. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const originError = assertSameOrigin(request)
  if (originError) return originError

  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'سجّل الدخول أولًا.' }, { status: 401 })

  const { id } = await params
  const body = (await request.json().catch(() => null)) as { rating?: unknown; note?: unknown } | null
  const rating = typeof body?.rating === 'number' ? Math.trunc(body.rating) : NaN
  const note = typeof body?.note === 'string' ? body.note : ''

  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: 'التقييم يجب أن يكون من ١ إلى ٥.' }, { status: 400 })
  }

  const ok = await rateTicket(id, session.sub, rating, note)
  if (!ok) return NextResponse.json({ error: 'تعذر حفظ التقييم.' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
