/**
 * The operator surfaces one account may hold, and where each one lives.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * The platform owner needs to *work as* each role the product has — client,
 * inspector, support agent — without the account ever changing what it is. The
 * account stays `admin` throughout; what moves is which surface it is standing
 * in. That is the same shape the owner's inspector toggle already had, widened
 * from one alternative surface to three.
 *
 * A note on why this is a *surface* and not a stored role:
 *
 *   * `user_profiles.role` has a CHECK constraint limited to
 *     `customer | inspector | admin`. A fourth value would need a migration.
 *   * `admin` and `super_admin` are already derived from the environment rather
 *     than stored, deliberately, "so it can never be granted by a database write
 *     alone". Surfaces follow the same rule for the same reason.
 *   * The account is a platform owner, so `getSession()` resolves it to `admin`
 *     before it ever reads `inspector_status`. It can never *be* an inspector, a
 *     customer or a support agent — 16 API routes test `role !== 'inspector'`
 *     and would refuse it while the page rendered. Hence a surface, not a role.
 *
 * Pure by construction: no Clerk, no `next/headers`, no `server-only`. That
 * keeps the allow/deny matrix unit-testable in the node environment, like the
 * rest of `lib/`.
 */

/** The surfaces an operator can stand in. */
export type Surface = 'customer' | 'inspector' | 'support'

export const SURFACES: readonly Surface[] = ['customer', 'inspector', 'support']

/**
 * Where each surface begins.
 *
 * These are the real workspaces, not copies: the owner entering the support
 * surface lands on the same console a support agent would, and entering the
 * client surface lands on the same workspace a customer sees. A parallel
 * "preview" tree would drift from the real one and stop being evidence of
 * anything.
 */
export const SURFACE_HOME: Record<Surface, string> = {
  customer: '/dashboard',
  inspector: '/inspector/dashboard',
  support: '/admin/support',
}

/** How each surface is named in the UI. */
export const SURFACE_LABEL: Record<Surface, string> = {
  customer: 'عميل',
  inspector: 'فاحص',
  support: 'دعم فني',
}

/** One line of context per surface, for the switcher menu. */
export const SURFACE_HINT: Record<Surface, string> = {
  customer: 'طلب الفحص ومتابعته وتقاريره',
  inspector: 'الطلبات المتاحة والعمل الميداني',
  support: 'تذاكر الدعم والردود الجاهزة',
}

export function isSurface(value: unknown): value is Surface {
  return typeof value === 'string' && (SURFACES as readonly string[]).includes(value)
}

/**
 * The destination for a surface.
 *
 * Total, and deliberately not `?? '/admin'`: an unrecognised surface is a bug,
 * and silently landing an operator on the admin console would hide it. Callers
 * that may hold untrusted input validate with `isSurface()` first.
 */
export function surfaceHomePath(surface: Surface): string {
  return SURFACE_HOME[surface]
}
