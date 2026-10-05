import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getClientIp } from '@/lib/client-ip'
import { attemptsRemaining, lockoutRemainingSeconds, otpConfig } from '@/lib/otp'
import { consumePhoneOtp, readOtpState } from '@/lib/otp-store'
import { assertSameOrigin } from '@/lib/origin'
import { consumeRateLimit } from '@/lib/rate-limit'

/**
 * Verifies a submitted OTP and, on success, unlocks the account.
 *
 * The unlock itself happens inside the `consume_phone_otp` transaction — this
 * handler never writes `phone_verified` directly, so there is no window where a
 * code is accepted but the flag is not set. The next request re-reads the session
 * and the gate is already open, with no sign-out required.
 */

const VERIFY_LIMITS = {
  user: { limit: 20, windowMs: 15 * 60_000 },
  ip: { limit: 60, windowMs: 15 * 60_000 },
} as const

export async function POST(request: NextRequest) {
  const originError = assertSameOrigin(request)
  if (originError) return originError

  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'انتهت الجلسة. أعد تسجيل الدخول.' }, { status: 401 })

  if (session.phoneVerified) {
    return NextResponse.json({ ok: true, alreadyVerified: true })
  }

  const phone = session.phone
  if (!phone) {
    return NextResponse.json(
      { error: 'لا يوجد رقم جوال مرتبط بحسابك.', reason: 'no_phone' },
      { status: 400 },
    )
  }

  const body = (await request.json().catch(() => null)) as { code?: unknown } | null
  const code = typeof body?.code === 'string' ? body.code.replace(/\s+/g, '') : ''
  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: 'أدخل رمزًا مكوّنًا من ٦ أرقام.', reason: 'invalid' }, { status: 400 })
  }

  const config = otpConfig()

  try {
    const ip = getClientIp(request)
    const [byUser, byIp] = await Promise.all([
      consumeRateLimit(`otp:verify:user:${session.sub}`, VERIFY_LIMITS.user.limit, VERIFY_LIMITS.user.windowMs),
      consumeRateLimit(`otp:verify:ip:${ip}`, VERIFY_LIMITS.ip.limit, VERIFY_LIMITS.ip.windowMs),
    ])
    if (!byUser.ok || !byIp.ok) {
      const retryAfterSec = Math.max(byUser.retryAfterSec, byIp.retryAfterSec)
      return NextResponse.json(
        { error: 'محاولات كثيرة. حاول بعد قليل.', reason: 'rate_limited', retryAfterSec },
        { status: 429, headers: { 'Retry-After': String(retryAfterSec) } },
      )
    }
  } catch {
    // Throttling is best-effort; the RPC's own attempt counter is authoritative.
  }

  const result = await consumePhoneOtp(session.sub, phone, code)

  if (result.ok) {
    return NextResponse.json({ ok: true })
  }

  switch (result.reason) {
    case 'invalid': {
      const state = await readOtpState(phone)
      const remaining = state ? attemptsRemaining(state.failedAttempts, config.maxAttempts) : undefined
      return NextResponse.json(
        {
          error:
            remaining !== undefined && remaining > 0
              ? `الرمز غير صحيح. تبقّى ${remaining} ${remaining === 1 ? 'محاولة' : 'محاولات'}.`
              : 'الرمز غير صحيح.',
          reason: 'invalid',
          attemptsRemaining: remaining,
        },
        { status: 400 },
      )
    }
    case 'locked': {
      const state = await readOtpState(phone)
      const lockoutSeconds = state
        ? lockoutRemainingSeconds(state.lockedUntilMs, Date.now()) || config.lockoutSeconds
        : config.lockoutSeconds
      return NextResponse.json(
        {
          error: 'تم قفل المحاولات مؤقتًا لحماية حسابك. حاول لاحقًا.',
          reason: 'locked',
          retryAfterSec: lockoutSeconds,
        },
        { status: 429, headers: { 'Retry-After': String(lockoutSeconds) } },
      )
    }
    case 'expired':
      return NextResponse.json(
        { error: 'انتهت صلاحية الرمز. اطلب رمزًا جديدًا.', reason: 'expired' },
        { status: 410 },
      )
    case 'no_challenge':
      return NextResponse.json(
        { error: 'لا يوجد رمز فعّال. اطلب رمزًا جديدًا أولًا.', reason: 'no_challenge' },
        { status: 409 },
      )
    case 'not_found':
      return NextResponse.json({ error: 'تعذر العثور على ملف الحساب.', reason: 'not_found' }, { status: 404 })
    default:
      return NextResponse.json(
        { error: 'خدمة التحقق غير مهيأة على الخادم حاليًا.', reason: 'unavailable' },
        { status: 503 },
      )
  }
}
