import { auth as clerkAuth, currentUser as clerkCurrentUser } from '@clerk/nextjs/server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import {
  ADMIN_ELEVATION_COOKIE,
  INSPECTOR_VIEW_COOKIE,
  signAdminElevation,
  signInspectorView,
  verifyAdminElevation,
  verifyInspectorView,
} from '@/lib/admin-elevation'
import { isValidSaudiMobile, normalizePhone } from '@/lib/phone'
import type { Role } from '@/types/domain'
import { dashboardPath } from '@/lib/post-auth-path'
import { getUserByClerkId, getUserById, isPlatformAdmin, isPlatformOwner, upsertUserFromClerk } from '@/lib/user-store'

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
   */
  inspectorView: boolean
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
  // Inspector view mode is owner-only. A non-owner is refused here, before the
  // cookie is even verified, so a stolen or forged cookie is inert.
  const inspectorView = isOwner && await verifyInspectorView(
    jar.get(INSPECTOR_VIEW_COOKIE)?.value,
    clerkSession.sessionId,
  )
  const role: Role = isAdmin
    ? elevated ? 'admin' : 'admin_pending'
    : user.inspectorStatus === 'approved' ? 'inspector' : 'customer'

  return {
    sub: user.id,
    phone: user.phone,
    role,
    clerkSessionId: clerkSession.sessionId,
    clerkUserId: clerkSession.userId,
    inspectorView,
  }
}

/** Enters inspector view mode. Owner-only; enforced again in `getSession()`. */
export async function setInspectorViewCookie(sessionId: string) {
  const jar = await cookies()
  jar.set({
    name: INSPECTOR_VIEW_COOKIE,
    value: await signInspectorView(sessionId),
    ...adminElevationCookieOptions,
    maxAge: 30 * 24 * 60 * 60,
  })
}

export async function clearInspectorViewCookie() {
  const jar = await cookies()
  jar.set({
    name: INSPECTOR_VIEW_COOKIE,
    value: '',
    ...adminElevationCookieOptions,
    maxAge: 0,
  })
}

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
  jar.set({
    name: ADMIN_ELEVATION_COOKIE,
    value: '',
    ...adminElevationCookieOptions,
    maxAge: 0,
  })
  jar.set({
    name: INSPECTOR_VIEW_COOKIE,
    value: '',
    ...adminElevationCookieOptions,
    maxAge: 0,
  })
  jar.set({
    name: 'fahes_session',
    value: '',
    ...adminElevationCookieOptions,
    maxAge: 0,
  })
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
