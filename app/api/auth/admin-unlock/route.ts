import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminAccessCode } from '@/lib/admin-gate'
import { getSession, setAdminElevationCookie } from '@/lib/auth'
import { getClientIp } from '@/lib/client-ip'
import { assertSameOrigin } from '@/lib/origin'
import { consumeRateLimit } from '@/lib/rate-limit'
import { logAuditEvent } from '@/lib/audit'
import { getUserById } from '@/lib/user-store'

/**
 * Elevation gate. Reached only by `admin_pending` sessions (owners never see
 * it). Every outcome is audited — a burst of failures against one account is
 * the earliest sign of someone probing the gate.
 */
export async function POST(request: NextRequest) {
  const originError = assertSameOrigin(request)
  if (originError) return originError

  const session = await getSession()
  if (!session || (session.role !== 'admin_pending' && session.role !== 'admin')) {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  }

  const ip = getClientIp(request)
  const limit = await consumeRateLimit(`admin-unlock:${ip}:${session.sub}`, 5, 15 * 60_000)
  if (!limit.ok) {
    await logAuditEvent({
      actorId: session.sub,
      eventType: 'admin.gate_throttled',
      resourceType: 'admin_gate',
      resourceId: session.sub,
      metadata: { ip, retryAfterSec: limit.retryAfterSec },
    })
    return NextResponse.json({ error: 'تم قفل بوابة الإدارة مؤقتًا' }, { status: 429 })
  }

  let body: { code?: unknown } = {}
  try {
    body = (await request.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 })
  }
  const code = typeof body.code === 'string' ? body.code : ''
  if (!code) return NextResponse.json({ error: 'رمز الإدارة مطلوب' }, { status: 400 })

  const ok = await verifyAdminAccessCode(code)
  if (!ok) {
    await logAuditEvent({
      actorId: session.sub,
      eventType: 'admin.gate_failed',
      resourceType: 'admin_gate',
      resourceId: session.sub,
      metadata: { ip },
    })
    return NextResponse.json({ error: 'رمز الإدارة غير صحيح' }, { status: 403 })
  }

  const user = await getUserById(session.sub)
  if (!user || user.role !== 'admin') {
    await logAuditEvent({
      actorId: session.sub,
      eventType: 'admin.gate_denied_not_admin',
      resourceType: 'admin_gate',
      resourceId: session.sub,
      metadata: { ip },
    })
    return NextResponse.json({ error: 'هذا الحساب غير مخوّل للإدارة' }, { status: 403 })
  }

  await setAdminElevationCookie(session.clerkSessionId)
  await logAuditEvent({
    actorId: session.sub,
    eventType: 'admin.gate_passed',
    resourceType: 'admin_gate',
    resourceId: session.sub,
    metadata: { ip },
  })
  return NextResponse.json({ success: true, redirectTo: '/admin' })
}
