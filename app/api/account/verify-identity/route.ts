import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { assertSameOrigin } from '@/lib/origin'
import { enforceApiRateLimit } from '@/lib/api-rate-limit'
import { saveNationalId, isValidSaudiNationalId } from '@/lib/user-store'

export async function POST(request: NextRequest) {
  const originError = assertSameOrigin(request)
  if (originError) return originError

  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'سجّل الدخول أولًا.' }, { status: 401 })

  const rateLimitResponse = await enforceApiRateLimit(request, 'verify-identity', session.sub, {
    user: 10,
    ip: 20,
    windowMs: 60_000,
  })
  if (rateLimitResponse) return rateLimitResponse

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'طلب غير صالح.' }, { status: 400 })
  }

  const nationalId = typeof (body as { nationalId?: unknown })?.nationalId === 'string'
    ? (body as { nationalId: string }).nationalId.trim()
    : ''

  if (!nationalId || !isValidSaudiNationalId(nationalId)) {
    return NextResponse.json(
      { error: 'رقم الهوية يجب أن يكون 10 أرقام سعودية (يبدأ بـ 1 أو 2).' },
      { status: 400 },
    )
  }

  const result = await saveNationalId(session.sub, nationalId)

  if (!result.ok) {
    const reason = result.reason
    if (reason === 'duplicate') {
      return NextResponse.json(
        { error: 'رقم الهوية مرتبط بحساب آخر. تواصل مع الدعم للمساعدة.' },
        { status: 409 },
      )
    }
    if (reason === 'not_found') {
      return NextResponse.json({ error: 'الحساب غير موجود.' }, { status: 404 })
    }
    return NextResponse.json({ error: 'رقم الهوية غير صالح.' }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}
