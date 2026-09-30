import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminAccessCode } from '@/lib/admin-gate'
import { getSession, setAdminElevationCookie } from '@/lib/auth'
import { getClientIp } from '@/lib/client-ip'
import { assertSameOrigin } from '@/lib/origin'
import { consumeRateLimit } from '@/lib/rate-limit'
import { getUserById } from '@/lib/user-store'

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
    return NextResponse.json({ error: 'تم قفل بوابة الإدارة مؤقتًا' }, { status: 429 })
  }

  const body = await request.json()
  const code = typeof body.code === 'string' ? body.code : ''
  const ok = await verifyAdminAccessCode(code)
  if (!ok) {
    return NextResponse.json({ error: 'رمز الإدارة غير صحيح' }, { status: 403 })
  }

  const user = await getUserById(session.sub)
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'هذا الحساب غير مخوّل للإدارة' }, { status: 403 })
  }

  await setAdminElevationCookie(session.clerkSessionId)
  return NextResponse.json({ success: true, redirectTo: '/admin' })
}
