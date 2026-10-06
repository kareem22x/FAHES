import { auth as clerkAuth, currentUser as clerkCurrentUser } from '@clerk/nextjs/server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { NextResponse } from 'next/server'
import {
  ADMIN_ELEVATION_COOKIE,
  INSPECTOR_VIEW_COOKIE,
  SURFACE_COOKIE,
  signAdminElevation,
  signSurface,
  verifyAdminElevation,
  verifyInspectorView,
  verifySurface,
} from '@/lib/admin-elevation'
import { isValidSaudiMobile, normalizePhone } from '@/lib/phone'
import type { Surface } from '@/lib/surfaces'
import type { Role } from '@/types/domain'
import { dashboardPath } from '@/lib/post-auth-path'
import { clearsPhoneGate, getUserByClerkId, getUserById, isPlatformAdmin, isPlatformOwner, upsertUserFromClerk } from '@/lib/user-store'

export type AppSession = {
  sub: string
  phone: string | null
  role: Role
  clerkSessionId: string
  clerkUserId: string
  /**
   * True only for a platform owner who has switched into inspector view mode.
   *
   * It is *not* a role and carries no privileges of its own — `isInspectorSession()`
   * in `lib/field/access.ts` still re-checks `isPlatformOwner()` on the live
   * identity, so this flag can never lift a non-owner into the inspector APIs.
   *
   * Retained as a derived convenience: it is exactly `surface === 'inspector'`,
   * and keeping it means the sixteen call sites that already ask this question
   * did not have to change when the single toggle became three surfaces.
   */
  inspectorView: boolean
  /**
   * Which operator surface the owner is standing in, or `null` for the ordinary
   * admin console.
   *
   * Owner-only, and honoured only together with `isPlatformOwner()` on the live
   * identity — the cookie is a signed, session-bound *switch*, never a grant, so
   * a non-owner presenting a perfect forgery is still a non-owner.
   *
   * This is deliberately a surface rather than a stored role. The account holds
   * `admin` permanently (it is env-listed), so it can never *be* a customer,
   * inspector or support agent: `getSession()` resolves the role to `admin`
   * before it reads `inspector_status`, and dozens of API routes test the role
   * directly. Changing which surface it stands in leaves every one of those
   * checks correct.
   */
  surface: Surface | null
  /**
   * True when the customer has both a verified phone (via Clerk) and a
   * national ID (10-digit Saudi ID entered in the profile). Customers who
   * are not yet verified are redirected to /verify-identity.
   * Admins and inspectors are always considered verified.
   */
  isVerified: boolean
  /**
   * Mirrors `AppUser.phoneVerified`. The route gatekeeper reads this from the
   * proxy so the check happens before a protected tree starts rendering.
   */
  phoneVerified: boolean
}

const adminElevationCookieOptions = {
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
}

function verifiedPhoneNumber(user: NonNullable<Awaited<ReturnType<typeof clerkCurrentUser>>>) {
  const primary = user.phoneNumbers.find((phone) => phone.id === user.primaryPhoneNumberId)
  const candidate = primary?.verification?.status === 'verified'
    ? primary
    : user.phoneNumbers.find((phone) => phone.verification?.status === 'verified')
  return candidate && isValidSaudiMobile(candidate.phoneNumber) ? normalizePhone(candidate.phoneNumber) : null
}

export async function getSession(): Promise<AppSession | null> {
  const clerkSession = await clerkAuth()
  if (!clerkSession.userId || !clerkSession.sessionId) return null

  let user = await getUserByClerkId(clerkSession.userId)
  if (!user) {
    const clerkUser = await clerkCurrentUser()
    if (!clerkUser || clerkUser.id !== clerkSession.userId) return null
    const phone = verifiedPhoneNumber(clerkUser)
    const name = clerkUser.fullName?.trim() ||
      [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ').trim() ||
      'عميل'
    user = await upsertUserFromClerk(clerkUser.id, phone, name)
  }

  const jar = await cookies()
  const identity = { phone: user.phone, clerkUserId: clerkSession.userId }
  const isAdmin = isPlatformAdmin(identity)
  const isOwner = isPlatformOwner(identity)
  // Owners are permanently elevated: they never see the /admin/gate prompt.
  const elevated = isAdmin && (isOwner || await verifyAdminElevation(
    jar.get(ADMIN_ELEVATION_COOKIE)?.value,
    clerkSession.sessionId,
  ))
  // Surfaces are owner-only. A non-owner is refused here, before either cookie
  // is even read, so a stolen or forged cookie is inert.
  //
  // The second read is a migration: `fahes_surface` is the current cookie, and
  // `fahes_inspector_view` is the single-boolean cookie it replaced. An owner who
  // was already inside the inspector surface when this shipped still holds the
  // old one, and dropping that read would bounce them to the admin console
  // mid-session. The old cookie is never written again, so it ages out.
  const surface: Surface | null = isOwner
    ? (await verifySurface(jar.get(SURFACE_COOKIE)?.value, clerkSession.sessionId))
      ?? (await verifyInspectorView(jar.get(INSPECTOR_VIEW_COOKIE)?.value, clerkSession.sessionId)
        ? 'inspector'
        : null)
    : null
  const inspectorView = surface === 'inspector'
  const role: Role = isAdmin
    ? elevated ? 'admin' : 'admin_pending'
    : user.inspectorStatus === 'approved' ? 'inspector' : 'customer'

  const isVerified = role !== 'customer' || user.isVerified

  return {
    sub: user.id,
    phone: user.phone,
    role,
    clerkSessionId: clerkSession.sessionId,
    clerkUserId: clerkSession.userId,
    inspectorView,
    surface,
    isVerified,
    phoneVerified: user.phoneVerified,
  }
}

/**
 * Records the surface the owner is standing in.
 *
 * Called only from an owner-authorised route, but nothing here trusts that: the
 * cookie is signed and bound to the Clerk session id, and `getSession()` refuses
 * to read it for anyone who is not an owner on the live identity.
 */
export async function setSurfaceCookie(sessionId: string, surface: Surface) {
  const jar = await cookies()
  jar.set({
    name: SURFACE_COOKIE,
    value: await signSurface(sessionId, surface),
    ...adminElevationCookieOptions,
    maxAge: 30 * 24 * 60 * 60,
  })
  // Retire the superseded cookie in the same response. Leaving it set would keep
  // the migration read alive and let the two disagree about the surface.
  jar.set({
    name: INSPECTOR_VIEW_COOKIE,
    value: '',
    ...adminElevationCookieOptions,
    maxAge: 0,
  })
}

/**
 * Leaves every surface and returns to the ordinary admin console.
 *
 * Clears the superseded `INSPECTOR_VIEW_COOKIE` in the same response, and that
 * is not belt-and-braces: `getSession()` reads the old cookie as a *fallback*
 * when the new one is absent, so clearing only `fahes_surface` would let an
 * owner who had ever used the single inspector toggle leave the surface and be
 * pulled straight back into it by the migration read. The two cookies are
 * retired together or the exit silently fails.
 */
export async function clearSurfaceCookie() {
  const jar = await cookies()
  for (const name of [SURFACE_COOKIE, INSPECTOR_VIEW_COOKIE]) {
    jar.set({
      name,
      value: '',
      ...adminElevationCookieOptions,
      maxAge: 0,
    })
  }
}

/**
 * The single-boolean inspector-view writers are gone.
 *
 * `fahes_inspector_view` is read-only from here on: `getSession()` still
 * consults it as the migration fallback for an owner who was inside the
 * inspector surface when the surface cookie shipped, and `signInspectorView`
 * stays in `lib/admin-elevation.ts` as the counterpart that proves the read
 * works. Nothing writes the cookie any more — every entry point, including the
 * legacy `/api/auth/inspector-view` route, writes `fahes_surface` — so it ages
 * out with the session and the fallback disappears on its own.
 */

export async function setAdminElevationCookie(sessionId: string) {
  const jar = await cookies()
  jar.set({
    name: ADMIN_ELEVATION_COOKIE,
    value: await signAdminElevation(sessionId),
    ...adminElevationCookieOptions,
    maxAge: 4 * 60 * 60,
  })
}

export async function clearSessionCookie() {
  const jar = await cookies()
  for (const name of [ADMIN_ELEVATION_COOKIE, INSPECTOR_VIEW_COOKIE, SURFACE_COOKIE, 'fahes_session']) {
    jar.set({
      name,
      value: '',
      ...adminElevationCookieOptions,
      maxAge: 0,
    })
  }
}

export async function requireSession() {
  const session = await getSession()
  if (!session) redirect('/sign-in')
  return session
}

export async function requireRoles(roles: Role[]) {
  const session = await requireSession()
  if (roles.includes(session.role)) return session
  // Owners are allowed into every area of the product (customer + inspector + admin).
  if (isPlatformOwner({ phone: session.phone, clerkUserId: session.clerkUserId })) return session
  redirect(dashboardPath(session))
}

/**
 * Second gate on the phone-verification wall, behind the edge proxy.
 *
 * The proxy drops unverified requests before a protected tree renders; this guard
 * is the authoritative check for the case the proxy cannot cover — a degraded
 * lookup, or a navigation that reaches the layout directly. Both call the same
 * predicate (`clearsPhoneGate`), so they cannot disagree.
 */
export async function requirePhoneVerified(session: AppSession): Promise<AppSession> {
  if (clearsPhoneGate(session)) return session
  redirect('/verify-phone')
}

/**
 * The API counterpart to `requirePhoneVerified`.
 *
 * Same predicate, different failure mode. A page guard *redirects*, because a
 * browser can render the gate; an API caller gets JSON and a status code,
 * because a 307 into an HTML page is not a response `fetch` can use.
 *
 * This exists because the proxy only protects page prefixes. `/api/support/*`
 * sits outside them, so without this an authenticated-but-unverified account
 * could open a ticket by calling the endpoint directly and never seeing the
 * redirect the UI would have given it — the wall would be decorative.
 *
 * Returns a result rather than throwing, so each handler keeps its own early
 * return and the route stays readable:
 *
 *   const guard = await requireVerifiedSession()
 *   if (!guard.ok) return guard.response
 *
 * 401 and 403 stay distinct on purpose: "sign in" and "verify your phone" are
 * different instructions, and the client acts on the difference.
 */
export type VerifiedSessionResult =
  | { ok: true; session: AppSession }
  | { ok: false; response: NextResponse }

export async function requireVerifiedSession(): Promise<VerifiedSessionResult> {
  const session = await getSession()
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'سجّل الدخول أولًا.', reason: 'unauthenticated' },
        { status: 401 },
      ),
    }
  }
  if (!clearsPhoneGate(session)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'وثّق رقم جوالك أولًا لتستخدم تذاكر الدعم الفني.', reason: 'phone_unverified' },
        { status: 403 },
      ),
    }
  }
  return { ok: true, session }
}

/**
 * Role → console mapping, the post-authentication destination, and the
 * inspector-view exit destination.
 *
 * Defined in `lib/post-auth-path.ts` so all three stay unit-testable without
 * importing Clerk or `next/headers`; re-exported here so callers keep using the
 * one auth entry point. Each takes the session itself (or any `{ role,
 * inspectorView }` bag) rather than a bare role, so the owner's dual-role
 * toggle is honoured without the caller having to know about it.
 */
export { dashboardPath, postAuthPath, inspectorExitPath } from '@/lib/post-auth-path'

/**
 * Sanitises a post-authentication destination. Defined in
 * `lib/safe-return-path.ts` so it stays importable — and unit-testable —
 * without dragging Clerk and `next/headers` into the node test environment.
 */
export { safeReturnPath, DEFAULT_POST_AUTH_PATH } from '@/lib/safe-return-path'

export async function currentUser() {
  const session = await getSession()
  if (!session) return null
  return getUserById(session.sub)
}
