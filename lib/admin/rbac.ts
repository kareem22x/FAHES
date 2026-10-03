import 'server-only'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getSession, type AppSession } from '@/lib/auth'
import { dashboardPath } from '@/lib/post-auth-path'
import { consumeRateLimit } from '@/lib/rate-limit'
import { logAuditEvent } from '@/lib/audit'
import { isPlatformOwner } from '@/lib/user-store'
import type { Json } from '@/lib/supabase/database.types'

/**
 * Role verification helpers — the single source of truth for who may touch the
 * admin console.
 *
 * Two privileged tiers exist:
 *   `admin`       — env-listed operator (ADMIN_PHONES / ADMIN_CLERK_IDS), must
 *                   pass the access-code gate once per session.
 *   `super_admin` — env-listed owner (ADMIN_OWNER_*). Permanently elevated: no
 *                   gate, may grant/revoke admin, may open every area.
 *
 * The product's stored `role` column only has `customer | inspector | admin`;
 * `super_admin` is derived from the environment rather than stored, so it can
 * never be granted by a database write alone.
 */

export type AdminTier = 'admin' | 'super_admin'

export const ADMIN_LIMITS = {
  /** Reads and routine writes. */
  standard: { user: 60, ip: 120, windowMs: 60_000 },
  /** Privilege changes and destructive operations. */
  sensitive: { user: 20, ip: 40, windowMs: 10 * 60_000 },
} as const

export type AdminLimits = (typeof ADMIN_LIMITS)[keyof typeof ADMIN_LIMITS]

/** Thrown when an admin action is refused. Message is safe to show in Arabic. */
export class AdminForbiddenError extends Error {
  constructor(message = 'غير مصرح') {
    super(message)
    this.name = 'AdminForbiddenError'
  }
}

/** True when the signed-in admin is a site owner (super_admin). */
export function isOwnerSession(session: AppSession) {
  return isPlatformOwner({ phone: session.phone, clerkUserId: session.clerkUserId })
}

export function tierOf(session: AppSession): AdminTier {
  return isOwnerSession(session) ? 'super_admin' : 'admin'
}

/**
 * Server-component guard. Returns the session only for a fully elevated admin.
 * `admin_pending` is sent to the access-code gate; everyone else to their own
 * dashboard. Never returns for an unauthorized caller.
 */
export async function requireAdminPage(): Promise<AppSession> {
  const session = await getSession()
  if (!session) redirect('/sign-in')
  if (session.role === 'admin_pending') redirect('/admin/gate')
  if (session.role !== 'admin') redirect(dashboardPath(session))
  return session
}

/** Server-action guard. Throws instead of redirecting so the action can report. */
export async function requireAdminAction(operation: string, limits: AdminLimits = ADMIN_LIMITS.standard) {
  const session = await getSession()
  if (!session) throw new AdminForbiddenError('انتهت الجلسة. أعد تسجيل الدخول')
  // `admin_pending` deliberately fails: the gate is a UI affordance only.
  if (session.role !== 'admin') throw new AdminForbiddenError()

  const ip = await clientIp()
  const [byUser, byIp] = await Promise.all([
    consumeRateLimit(`${operation}:user:${session.sub}`, limits.user, limits.windowMs),
    consumeRateLimit(`${operation}:ip:${ip}`, limits.ip, limits.windowMs),
  ])
  if (!byUser.ok || !byIp.ok) throw new AdminForbiddenError('تم تجاوز الحد المسموح. حاول لاحقًا')

  return { session, isOwner: isOwnerSession(session), tier: tierOf(session) }
}

/** Requires the super_admin tier (owner). Used for privilege changes. */
export async function requireSuperAdminAction(operation: string, limits: AdminLimits = ADMIN_LIMITS.sensitive) {
  const context = await requireAdminAction(operation, limits)
  if (!context.isOwner) throw new AdminForbiddenError('هذا الإجراء متاح للمالك فقط')
  return context
}

/**
 * Client IP for server actions. Server actions are not handed a `NextRequest`,
 * so the forwarded headers are read directly. Next.js validates the Origin of
 * every server-action POST itself, so CSRF is covered by the framework here.
 */
export async function clientIp() {
  const headerList = await headers()
  const forwarded = headerList.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]?.trim() || 'unknown'
  return headerList.get('x-real-ip') || 'unknown'
}

/**
 * Appends an administrative action to the immutable trail. Best-effort by
 * design: a logging failure must never roll back the action it describes.
 */
export async function auditAdminAction(
  session: AppSession,
  eventType: string,
  resourceType: string,
  resourceId: string | null,
  metadata: Record<string, Json> = {},
) {
  return logAuditEvent({
    actorId: session.sub,
    eventType,
    resourceType,
    resourceId,
    metadata,
  })
}

/** Uniform result shape returned by every admin server action. */
export type ActionState = { ok: boolean; message: string } | null

export function actionError(error: unknown): ActionState {
  if (error instanceof AdminForbiddenError) return { ok: false, message: error.message }
  console.error('admin_action_failed', error)
  return { ok: false, message: 'تعذر تنفيذ الإجراء' }
}
