import { NextRequest, NextResponse } from 'next/server'
import { clearSurfaceCookie, getSession, setSurfaceCookie } from '@/lib/auth'
import { assertSameOrigin } from '@/lib/origin'
import { logAuditEvent } from '@/lib/audit'
import { isPlatformOwner } from '@/lib/user-store'
import { inspectorExitPath } from '@/lib/post-auth-path'
import { surfaceHomePath } from '@/lib/surfaces'

/**
 * The owner's original dual-role toggle: enter and leave the inspector surface.
 *
 * ── Why this still exists ──────────────────────────────────────────────────
 *
 * The single boolean toggle has been superseded by `/api/auth/surface`, which
 * carries the surface name and serves three of them. This route is kept as a
 * thin translation layer rather than deleted, for two reasons:
 *
 *   1. It used to write `fahes_inspector_view`, the cookie the surface cookie
 *      now supersedes. Anything that still calls it — a stale tab holding the
 *      old client bundle, a bookmark, a mobile build mid-update — would
 *      otherwise keep writing a cookie the exit path no longer reads, and the
 *      owner would find themselves unable to leave the surface.
 *   2. It is the documented endpoint in the older notes, and a redirect of
 *      *semantics* is cheaper to reason about than a 404.
 *
 * So it now writes the same `fahes_surface` cookie the switcher writes. There
 * is one source of truth for which surface the owner stands in; the boolean is
 * a spelling of `inspector`, and leaving is leaving every surface.
 *
 * ── Why this is a route and not a UI-only affordance ───────────────────────
 *
 * The flag lives in a signed, HttpOnly cookie, so the client cannot set it — and
 * that is exactly the point. Nothing here trusts the request body beyond the
 * `view` boolean; the *authorisation* is re-derived from the live Clerk session
 * on every call. A caller who is not a platform owner gets 403 regardless of
 * what they send, which is what makes the cookie safe to hold a surface switch.
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

  let body: { view?: unknown } = {}
  try {
    body = (await request.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 })
  }
  if (typeof body.view !== 'boolean') {
    return NextResponse.json({ error: 'حدّد الواجهة المطلوبة' }, { status: 400 })
  }

  const entering = body.view
  if (entering) await setSurfaceCookie(session.clerkSessionId, 'inspector')
  else await clearSurfaceCookie()

  await logAuditEvent({
    actorId: session.sub,
    eventType: entering ? 'admin.inspector_view_entered' : 'admin.inspector_view_left',
    resourceType: 'user',
    resourceId: session.sub,
    metadata: { role: session.role, surface: entering ? 'inspector' : null },
  })

  // Leaving the inspector surface only returns an admin to the admin console.
  // `inspectorExitPath` refuses to send a non-owner there, so a stale cookie can
  // never turn this response into an admin-URL leak.
  const redirectTo = entering
    ? surfaceHomePath('inspector')
    : inspectorExitPath({ role: session.role })

  return NextResponse.json({ success: true, inspectorView: entering, redirectTo })
}
