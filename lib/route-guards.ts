/**
 * The route-protection map — one place that says which URL prefixes are gated,
 * and which guard owns each dashboard.
 *
 * ── Why this is a module and not a constant inside `proxy.ts` ──────────────
 *
 * The gate used to be defined only in `proxy.ts`, which meant the claim "every
 * dashboard is protected" could only be checked by reading six files and hoping.
 * Two things can silently break it:
 *
 *   1. a new page added under a prefix nobody remembered to add to the gate;
 *   2. a layout guard removed or renamed, leaving the prefix listed but the
 *      subtree open.
 *
 * Both are now assertions in `lib/route-guards.test.ts`, which walks the real
 * `app/` tree. `proxy.ts` imports the prefix lists from here, so the middleware
 * and the test can never disagree about what "protected" means.
 *
 * Pure by construction: no `server-only`, no Node APIs — `proxy.ts` runs it on
 * the edge, and `vitest` runs it in Node.
 */

/**
 * Prefixes that require a signed-in identity.
 *
 * This is an authentication gate only. Role authorization
 * (`customer` / `inspector` / `admin`) stays in the layouts and API routes,
 * where the lookup is cheap and the decision is made against fresh data.
 */
export const PROTECTED_PREFIXES = [
  '/admin',
  '/inspector',
  '/dashboard',
  '/account',
  '/requests',
  '/support',
] as const

/**
 * Prefixes that additionally require a verified phone number.
 *
 * `/requests` is deliberately absent: it hosts the public booking wizard, and
 * walling that off behind verification would block the first thing a new
 * customer does.
 */
export const PHONE_GATE_PREFIXES = ['/inspector', '/admin', '/dashboard', '/support'] as const

/**
 * Routes that must stay reachable while the phone gate is closed:
 *   * `/verify-phone` — the gate's own target (otherwise: infinite redirect);
 *   * `/account`      — where a phone-less user adds the number they must verify;
 *   * `/admin/gate`   — the admin access-code step, a separate concern.
 */
export const PHONE_GATE_EXEMPT = ['/verify-phone', '/account', '/admin/gate'] as const

export function matchesPrefix(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

export function isProtectedPath(pathname: string): boolean {
  return matchesPrefix(pathname, PROTECTED_PREFIXES)
}

export function isPhoneGatedPath(pathname: string): boolean {
  if (matchesPrefix(pathname, PHONE_GATE_EXEMPT)) return false
  return matchesPrefix(pathname, PHONE_GATE_PREFIXES)
}

export type DashboardGuard = {
  /** URL prefix owned by this dashboard. */
  prefix: string
  /** Layout file, relative to the project root, that must carry the guard. */
  layout: string
  /** The guard call the layout must make. */
  guard: string
  /** Who is admitted. Documentation for the audit report. */
  audience: string
}

/**
 * Every dashboard surface and the single guard that owns it.
 *
 * Adding a dashboard means adding a row here — the test then requires that the
 * layout exists and actually calls the guard, and that no page under the prefix
 * escapes a guarded layout.
 */
export const DASHBOARD_GUARDS: readonly DashboardGuard[] = [
  {
    prefix: '/admin',
    layout: 'app/(admin)/admin/(console)/layout.tsx',
    guard: 'requireAdminPage',
    audience: 'مدير / مالك — بعد بوابة رمز الدخول',
  },
  {
    prefix: '/inspector',
    layout: 'app/inspector/layout.tsx',
    guard: "requireRoles(['inspector'])",
    audience: 'فاحص معتمد (أو المالك في وضع الفاحص)',
  },
  {
    prefix: '/dashboard',
    layout: 'app/dashboard/layout.tsx',
    guard: "requireRoles(['customer'])",
    audience: 'عميل',
  },
  {
    prefix: '/support',
    layout: 'app/support/layout.tsx',
    guard: 'requireSession',
    audience: 'أي مستخدم مسجَّل',
  },
  {
    prefix: '/requests',
    layout: 'app/requests/layout.tsx',
    guard: 'requireSession',
    audience: 'أي مستخدم مسجَّل',
  },
] as const

/**
 * `app/`-relative directory names that are route groups or private folders and
 * therefore contribute nothing to the URL.
 */
export function stripRouteNoise(segment: string): string | null {
  // `(admin)` groups organise files; `_private` folders opt out of routing.
  if (segment.startsWith('(') && segment.endsWith(')')) return null
  if (segment.startsWith('_')) return null
  return segment
}

/**
 * Protected prefixes that rely on the middleware auth gate alone.
 *
 * `/account` is the signed-in user's own settings screen. It has no role
 * dashboard behind it — every signed-in role may open it — so a layout guard
 * would have nothing to check beyond what the middleware already did.
 */
export const PROXY_ONLY_PREFIXES = ['/account'] as const

/**
 * Routes inside a protected prefix that deliberately sit *outside* its guarded
 * layout.
 *
 * `/admin/gate` is where an `admin_pending` account enters the access code. The
 * console layout redirects such an account to this very route, so wrapping it in
 * that layout would produce an infinite redirect. It is the reason the console
 * uses the extra `(console)` route group.
 */
export const GUARD_EXEMPT_ROUTES = ['/admin/gate'] as const

/** Turns an `app/`-relative path into the URL it serves, or `null` if it serves none. */
export function routeFromAppPath(relativePath: string): string | null {
  const segments = relativePath.split('/').filter(Boolean)
  if (segments.length === 0) return null

  const last = segments[segments.length - 1]
  // Only `page.tsx` produces a URL; `layout.tsx`, `loading.tsx`, `route.ts` do not.
  if (!/^page\.(tsx|ts|jsx|js)$/.test(last)) return null

  const urlSegments: string[] = []
  for (const segment of segments.slice(0, -1)) {
    const cleaned = stripRouteNoise(segment)
    if (cleaned === null) continue
    // Dynamic segments map to a single concrete path for the purposes of the
    // prefix check: `[id]` → `:id`, `[[...slug]]` → `:slug`.
    urlSegments.push(segment.startsWith('[') ? ':param' : cleaned)
  }

  return `/${urlSegments.join('/')}`.replace(/\/$/, '') || '/'
}
