import { auth as clerkAuth, currentUser as clerkCurrentUser } from '@clerk/nextjs/server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { ADMIN_ELEVATION_COOKIE, signAdminElevation, verifyAdminElevation } from '@/lib/admin-elevation'
import { isValidSaudiMobile, normalizePhone } from '@/lib/phone'
import type { Role } from '@/lib/types'
import { getUserByClerkId, getUserById, isAdminPhone, upsertUserFromClerk } from '@/lib/user-store'

export type AppSession = {
  sub: string
  phone: string | null
  role: Role
  clerkSessionId: string
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
  const isAdmin = isAdminPhone(user.phone)
  const elevated = isAdmin && await verifyAdminElevation(
    jar.get(ADMIN_ELEVATION_COOKIE)?.value,
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
  }
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
  if (!roles.includes(session.role)) redirect(dashboardPath(session.role))
  return session
}

export function dashboardPath(role: Role) {
  if (role === 'admin') return '/admin'
  if (role === 'admin_pending') return '/admin/gate'
  if (role === 'inspector') return '/inspector/dashboard'
  return '/dashboard'
}

export async function currentUser() {
  const session = await getSession()
  if (!session) return null
  return getUserById(session.sub)
}
