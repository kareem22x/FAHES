import { NextRequest, NextResponse } from 'next/server'
import { clerkMiddleware } from '@clerk/nextjs/server'
import { logAuditEvent } from '@/lib/audit'
import { phoneGateDecision } from '@/lib/phone-gate'

/**
 * Prefixes that require a signed-in identity. This is an authentication gate
 * only — role authorization (`customer` / `inspector` / `admin`) stays in the
 * server components and API routes, where the Supabase lookup is cheap and
 * where the decision can be made against fresh data. Gating here means an
 * anonymous request never even starts rendering the protected tree.
 */
const PROTECTED_PREFIXES = ['/admin', '/inspector', '/dashboard', '/account', '/requests', '/support'] as const

function isProtected(pathname: string) {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
}

/**
 * Surfaces that additionally require a verified phone number.
 *
 * `/inspector` (the inspector workspace), `/admin` (the operator console),
 * `/dashboard` (the customer console, the product's `/client/*` equivalent) and
 * `/support` (the ticket system).
 *
 * `/support` is gated because a ticket is the product's escalation channel: the
 * agent answering it has to be able to reach the requester, and the reply is
 * delivered into the account. Without the phone gate an unverified signup could
 * open a ticket no one can answer. The gate is what makes "open a ticket"
 * mean "registered *and* verified" rather than merely "signed in".
 *
 * `/requests` is deliberately NOT gated: it hosts the public inspection-booking
 * wizard, and walling that off behind verification would block the very first
 * thing a new customer does.
 */
const PHONE_GATE_PREFIXES = ['/inspector', '/admin', '/dashboard', '/support'] as const

/**
 * Routes that must stay reachable while the gate is closed:
 *   * `/verify-phone` — the gate's own target (otherwise: infinite redirect);
 *   * `/account`      — where a phone-less user adds the number they must verify;
 *   * `/admin/gate`   — the admin access-code step, which is a separate concern.
 */
const PHONE_GATE_EXEMPT = ['/verify-phone', '/account', '/admin/gate'] as const

function isPhoneGated(pathname: string) {
  if (PHONE_GATE_EXEMPT.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return false
  }
  return PHONE_GATE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
}

/**
 * A deliberately conservative CSP. It locks down the things that are pure wins
 * — framing, `<base>` injection, plugin embeds — and says nothing about
 * `script-src`/`style-src`/`connect-src`, because Clerk's hosted components and
 * Next's runtime would need a nonce pipeline to survive a stricter policy.
 * A policy that breaks sign-in protects nothing.
 */
const CONTENT_SECURITY_POLICY = [
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
  // Declared for the PWA: `worker-src` names the service worker that makes the
  // app installable, and `manifest-src` the web app manifest. Neither is
  // restricted by anything else in this policy (there is no `default-src`), so
  // listing them documents the requirement rather than tightening it.
  "worker-src 'self'",
  "manifest-src 'self'",
].join('; ')

/**
 * Permissions policy.
 *
 * The default denies camera, microphone and geolocation outright. That is right
 * for the public site — nothing there needs a sensor, and denying by default is
 * free.
 *
 * It is wrong for the surfaces that legitimately use them, and the failure is
 * silent: a denied feature is refused by the browser *before* the user ever sees
 * a permission prompt, so the code path just looks broken. A bare
 * `geolocation=()` denies the feature to the origin that owns it.
 *
 * Three surfaces need sensors, and each is allowed only what it uses:
 *
 *   `/inspector/field/*`        — the field audit trail is only legally
 *                                 meaningful if the coordinates are real, and
 *                                 photographing the vehicle is the point of the
 *                                 screen.
 *   `/inspector/dashboard/*`    — the report workflow uploads photos and video
 *                                 taken on the device.
 *   `/support/*`, `/admin/support/*` — the ticket form attaches the device's
 *                                 coordinates to a report. This was already
 *                                 implemented in `tickets-panel.tsx` and was
 *                                 being refused by this very policy, so the
 *                                 feature had never worked.
 *
 * Microphone stays denied everywhere: nothing in this product records audio.
 */
function permissionsPolicy(pathname: string) {
  const isField = pathname === '/inspector/field' || pathname.startsWith('/inspector/field/')
  const isInspectorWorkflow = pathname.startsWith('/inspector/dashboard/')
  const isSupport = pathname === '/support' || pathname.startsWith('/support/')
  const isAdminSupport = pathname === '/admin/support' || pathname.startsWith('/admin/support/')

  const camera = isField || isInspectorWorkflow
  const geolocation = isField || isSupport || isAdminSupport

  if (!camera && !geolocation) return 'camera=(), microphone=(), geolocation=()'

  return [
    `camera=${camera ? '(self)' : '()'}`,
    'microphone=()',
    `geolocation=${geolocation ? '(self)' : '()'}`,
  ].join(', ')
}

function applySecurityHeaders(response: NextResponse, pathname = '/') {
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Permissions-Policy', permissionsPolicy(pathname))
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin')
  response.headers.set('Cross-Origin-Resource-Policy', 'same-origin')
  response.headers.set('X-DNS-Prefetch-Control', 'off')
  response.headers.set('X-Permitted-Cross-Domain-Policies', 'none')
  response.headers.set('Content-Security-Policy', CONTENT_SECURITY_POLICY)

  // Admin screens carry other people's data and the audit trail. They must never
  // sit in a browser cache, a shared proxy, or the back-forward cache.
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
    response.headers.set('Pragma', 'no-cache')
  }

  if (process.env.NODE_ENV === 'production') {
    response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')
  }
  return response
}

export default clerkMiddleware(async (auth, request: NextRequest) => {
  const { pathname } = request.nextUrl

  if (!isProtected(pathname)) {
    return applySecurityHeaders(NextResponse.next(), pathname)
  }

  const { userId, sessionId } = await auth()

  if (userId) {
    // Authenticated. Before the request reaches a phone-gated product surface,
    // confirm the account's phone is verified. The server-side layout guard
    // re-checks the same predicate — this is the fast path, not the only path.
    if (isPhoneGated(pathname)) {
      const decision = await phoneGateDecision(userId)
      if (decision.action === 'block') {
        await logAuditEvent({
          actorId: null,
          eventType: 'access.blocked_phone_unverified',
          resourceType: 'route',
          resourceId: pathname,
          metadata: { path: pathname, reason: decision.reason, clerkUserId: userId },
        })

        const gateUrl = request.nextUrl.clone()
        gateUrl.pathname = '/verify-phone'
        gateUrl.search = ''
        gateUrl.searchParams.set('redirect_url', pathname)
        return applySecurityHeaders(NextResponse.redirect(gateUrl), pathname)
      }
    }

    return applySecurityHeaders(NextResponse.next(), pathname)
  }

  // Drop the request at the edge and leave a trail. The audit write is
  // best-effort: a logging failure must never turn into a 500 for a visitor
  // who simply is not signed in.
  await logAuditEvent({
    actorId: null,
    eventType: 'access.blocked_unauthenticated',
    resourceType: 'route',
    resourceId: pathname,
    metadata: {
      path: pathname,
      sessionId: sessionId ?? null,
      userAgent: (request.headers.get('user-agent') ?? '').slice(0, 300),
    },
  })

  const signInUrl = request.nextUrl.clone()
  signInUrl.pathname = '/sign-in'
  signInUrl.search = ''
  signInUrl.searchParams.set('redirect_url', pathname)

  return applySecurityHeaders(NextResponse.redirect(signInUrl), pathname)
})

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/__clerk/:path*',
  ],
}
