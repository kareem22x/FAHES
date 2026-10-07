import { NextRequest, NextResponse } from 'next/server'
import { phoneSaveErrorBody, phoneSaveHttpStatus } from '@/lib/account-phone'
import { enforceApiRateLimit } from '@/lib/api-rate-limit'
import { getSession } from '@/lib/auth'
import { assertSameOrigin } from '@/lib/origin'
import { saveAccountPhone } from '@/lib/user-store'

/**
 * Saves the account's phone number.
 *
 * ── What this route used to be ───────────────────────────────────────────────
 *
 * It read the caller's phone out of their Clerk profile and refused unless Clerk
 * reported it `verified`; the body was ignored entirely. That made it a *sync*
 * endpoint — it mirrored a number some other system had already proven, and it
 * could not set a number at all for an account whose Clerk profile held none.
 *
 * The OTP wall is gone, so this now takes the number the user typed and stores
 * it. `saveAccountPhone` documents exactly what that does and does not prove;
 * the short version is that the unique index on `user_profiles.phone` is now the
 * only property standing between two accounts and the same number.
 *
 * Status codes come from `lib/account-phone.ts` rather than being chosen here,
 * so the four failures cannot drift apart between the route and its tests.
 */
export async function POST(request: NextRequest) {
  const originError = assertSameOrigin(request)
  if (originError) return originError

  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'سجّل الدخول إلى حسابك أولًا.' }, { status: 401 })

  const rateLimitResponse = await enforceApiRateLimit(request, 'account-phone', session.sub, {
    user: 10,
    ip: 30,
    windowMs: 60_000,
  })
  if (rateLimitResponse) return rateLimitResponse

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'طلب غير صالح.' }, { status: 400 })
  }

  const phone = typeof (body as { phone?: unknown })?.phone === 'string'
    ? (body as { phone: string }).phone.trim()
    : ''
  if (!phone) {
    return NextResponse.json(phoneSaveErrorBody('invalid_phone'), {
      status: phoneSaveHttpStatus('invalid_phone'),
    })
  }

  try {
    const result = await saveAccountPhone(session.sub, phone)
    if (!result.ok) {
      return NextResponse.json(phoneSaveErrorBody(result.reason), {
        status: phoneSaveHttpStatus(result.reason),
      })
    }
    return NextResponse.json({ ok: true, phone: result.user.phone })
  } catch (error) {
    // A thrown error here is a downstream fault (Supabase, a missing column), not
    // something the caller did — hence 502 rather than 400.
    console.error('account_phone_save_failed', error)
    return NextResponse.json(phoneSaveErrorBody('unknown'), {
      status: phoneSaveHttpStatus('unknown'),
    })
  }
}
