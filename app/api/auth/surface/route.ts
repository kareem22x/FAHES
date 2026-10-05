import { NextRequest, NextResponse } from 'next/server'
import { clearSurfaceCookie, getSession, setSurfaceCookie } from '@/lib/auth'
import { logAuditEvent } from '@/lib/audit'
import { assertSameOrigin } from '@/lib/origin'
import { inspectorExitPath } from '@/lib/post-auth-path'
import { SURFACE_LABEL, isSurface, surfaceHomePath, type Surface } from '@/lib/surfaces'
import { isPlatformOwner } from '@/lib/user-store'

/**
 * The owner's role switch: stand in the client, inspector or support surface,
 * or step back out to the admin console.
 *
 * ── Why this is a route and not a UI-only affordance ───────────────────────
 *
 * The flag lives in a signed, HttpOnly cookie, so the client cannot set it — and
 * that is exactly the point. Nothing here trusts the request body beyond which
 * surface was asked for; the *authorisation* is re-derived from the live Clerk
 * session on every call. A caller who is not a platform owner gets 403
 * regardless of what they send, which is what makes the cookie safe to hold a
 * surface switch.
 *
 * ── Why a surface and not a role ───────────────────────────────────────────
 *
 * The account is env-listed, so `getSession()` resolves it to `admin` before it
 * ever reads `inspector_status`. It can never *be* a customer, an inspector or a
 * support agent: dozens of API routes test `session.role` directly and would
 * refuse it while the page still rendered. Moving the surface leaves every one
 * of those checks correct, and leaves the account's own privileges intact — it
 * is the same shape the single inspector toggle already had, widened to three.
 *
 * Owners only. A plain admin is refused: they have no inspector line of business
 * and their actions in the field APIs would be attributed to an account that
 * never passed verification.
 *
 * Each transition is audited, because "who was wearing which hat when they
 * touched this order" is precisely the question a dispute turns on.
 */
export async function POST(request: NextRequest) {
  const originError = assertSameOrigin(request)
  if (originError) return originError

  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'يجب تسجيل الدخول' }, { status: 401 })

  if (!isPlatformOwner({ phone: session.phone, clerkUserId: session.clerkUserId })) {
    return NextResponse.json({ error: 'تبديل الواجهة متاح للمالك فقط' }, { status: 403 })
  }

  let body: { surface?: unknown } = {}
  try {
    body = (await request.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 })
  }

  // `null` is meaningful and distinct from "absent": it is the explicit request
  // to leave every surface and return to the admin console. Anything else that
  // is not a known surface name — including an absent field, which arrives as
  // `undefined` — is rejected rather than coerced, so a typo cannot silently
  // drop the operator somewhere they did not ask for.
  //
  // Written as a branch rather than a ternary so the narrowing is explicit:
  // `body.surface` is `unknown`, and `x === null ? null : x` narrows to
  // `{} | undefined`, which is not assignable to `Surface | null`.
  let requested: Surface | null
  if (body.surface === null) requested = null
  else if (isSurface(body.surface)) requested = body.surface
  else return NextResponse.json({ error: 'حدّد الواجهة المطلوبة' }, { status: 400 })

  if (requested === null) await clearSurfaceCookie()
  else await setSurfaceCookie(session.clerkSessionId, requested)

  await logAuditEvent({
    actorId: session.sub,
    eventType: requested === null ? 'admin.surface_left' : 'admin.surface_entered',
    resourceType: 'user',
    resourceId: session.sub,
    metadata: {
      role: session.role,
      surface: requested,
      label: requested === null ? null : SURFACE_LABEL[requested],
    },
  })

  // Leaving only ever returns an owner to the admin console. `inspectorExitPath`
  // refuses to send a non-owner there, so a stale cookie can never turn this
  // response into an admin-URL leak.
  const redirectTo = requested === null
    ? inspectorExitPath({ role: session.role })
    : surfaceHomePath(requested)

  return NextResponse.json({ success: true, surface: requested, redirectTo })
}
