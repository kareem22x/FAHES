import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import {
  countUnreadNotifications,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/lib/notifications/store'
import { assertSameOrigin } from '@/lib/origin'

/** The inspector dashboard bell: list on GET, mark-read on POST. */

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'سجّل الدخول أولًا.' }, { status: 401 })

  const [notifications, unread] = await Promise.all([
    listNotifications(session.sub),
    countUnreadNotifications(session.sub),
  ])
  return NextResponse.json({ notifications, unread })
}

export async function POST(request: NextRequest) {
  const originError = assertSameOrigin(request)
  if (originError) return originError

  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'سجّل الدخول أولًا.' }, { status: 401 })

  const body = (await request.json().catch(() => null)) as { id?: unknown } | null
  const id = typeof body?.id === 'string' ? body.id : null

  if (id) {
    const ok = await markNotificationRead(session.sub, id)
    if (!ok) return NextResponse.json({ error: 'تعذر تحديث الإشعار.' }, { status: 404 })
    return NextResponse.json({ ok: true, unread: await countUnreadNotifications(session.sub) })
  }

  const changed = await markAllNotificationsRead(session.sub)
  return NextResponse.json({ ok: true, changed, unread: 0 })
}
