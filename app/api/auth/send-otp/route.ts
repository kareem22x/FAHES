import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getClientIp } from '@/lib/client-ip'
import { otpConfig } from '@/lib/otp'
import { issuePhoneOtp } from '@/lib/otp-store'
import { assertSameOrigin } from '@/lib/origin'
import { consumeRateLimit } from '@/lib/rate-limit'
import { otpMessage, sendSms, smsProvider } from '@/lib/sms'

/**
 * Issues a phone-verification OTP for the signed-in account.
 *
 * Three independent throttles apply, in this order:
 *   1. a per-account and per-IP bucket (stops scripted spraying across accounts);
 *   2. the RPC's own resend cooldown (`OTP_RESEND_COOLDOWN_SECONDS`, default 60s);
 *   3. the RPC's lockout, set by repeated failed *verification* attempts.
 *
 * The plaintext code leaves this handler exactly once — inside the SMS body.
 * In mock mode it is also echoed back so local development works without an SMS
 * account; that echo is suppressed in production.
 */

const SEND_LIMITS = {
  user: { limit: 8, windowMs: 15 * 60_000 },
  ip: { limit: 30, windowMs: 15 * 60_000 },
} as const

export async function POST(request: NextRequest) {
  const originError = assertSameOrigin(request)
  if (originError) return originError

  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'سجّل الدخول إلى حسابك أولًا.' }, { status: 401 })

  if (session.phoneVerified) {
    return NextResponse.json({ ok: true, alreadyVerified: true })
  }

  const phone = session.phone
  if (!phone) {
    return NextResponse.json(
      {
        error: 'لا يوجد رقم جوال مرتبط بحسابك. أضف رقمًا سعوديًا موثقًا من إعدادات الحساب أولًا.',
        reason: 'no_phone',
      },
      { status: 400 },
    )
  }

  const config = otpConfig()

  try {
    const ip = getClientIp(request)
    const [byUser, byIp] = await Promise.all([
      consumeRateLimit(`otp:send:user:${session.sub}`, SEND_LIMITS.user.limit, SEND_LIMITS.user.windowMs),
      consumeRateLimit(`otp:send:ip:${ip}`, SEND_LIMITS.ip.limit, SEND_LIMITS.ip.windowMs),
    ])
    if (!byUser.ok || !byIp.ok) {
      const retryAfterSec = Math.max(byUser.retryAfterSec, byIp.retryAfterSec)
      return NextResponse.json(
        { error: 'طلبات كثيرة على إرسال الرمز. حاول بعد قليل.', reason: 'rate_limited', retryAfterSec },
        { status: 429, headers: { 'Retry-After': String(retryAfterSec) } },
      )
    }
  } catch {
    // A rate-limit infrastructure failure must not block a legitimate user from
    // receiving their code; the RPC cooldown below still applies.
  }

  const issued = await issuePhoneOtp(phone)
  if (!issued.ok) {
    if (issued.reason === 'cooldown') {
      return NextResponse.json(
        {
          error: 'تم إرسال رمز حديثًا. انتظر قبل طلب رمز جديد.',
          reason: 'cooldown',
          retryAfterSec: config.resendCooldownSeconds,
        },
        { status: 429, headers: { 'Retry-After': String(config.resendCooldownSeconds) } },
      )
    }
    if (issued.reason === 'locked') {
      return NextResponse.json(
        {
          error: `تم قفل المحاولات مؤقتًا بعد عدد كبير من المحاولات الفاشلة. حاول بعد ${Math.round(config.lockoutSeconds / 60)} دقيقة.`,
          reason: 'locked',
          retryAfterSec: config.lockoutSeconds,
        },
        { status: 429, headers: { 'Retry-After': String(config.lockoutSeconds) } },
      )
    }
    return NextResponse.json(
      { error: 'خدمة التحقق غير مهيأة على الخادم حاليًا. تواصل مع الدعم.', reason: 'unavailable' },
      { status: 503 },
    )
  }

  const delivery = await sendSms(phone, otpMessage(issued.code, config.expiryMinutes))
  if (!delivery.ok) {
    return NextResponse.json(
      { error: 'تعذر إرسال الرسالة النصية. تحقق من الرقم وحاول مجددًا.', reason: 'sms_failed' },
      { status: 502 },
    )
  }

  const isMock = smsProvider() === 'mock'
  return NextResponse.json({
    ok: true,
    expiresAt: issued.expiresAt,
    cooldownSeconds: config.resendCooldownSeconds,
    maxAttempts: config.maxAttempts,
    // Development affordance only — never expose a live code in production.
    ...(isMock && process.env.NODE_ENV !== 'production' ? { devCode: issued.code } : {}),
  })
}
