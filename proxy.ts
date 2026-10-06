import { NextRequest, NextResponse } from 'next/server'
import { clerkMiddleware } from '@clerk/nextjs/server'
import { logAuditEvent } from '@/lib/audit'
import { phoneGateDecision } from '@/lib/phone-gate'
import { isPhoneGatedPath, isProtectedPath } from '@/lib/route-guards'

/**
 * The gate's prefix lists live in `lib/route-guards.ts`, not here.
 *
 * They used to be defined in this file, which made "every dashboard is
 * protected" a claim nobody could check without reading six files. The module is
 * also read by `lib/route-guards.test.ts`, which walks the real `app/` tree and
 * fails if a page escapes a guarded layout or a layout loses its guard. Sharing
 * one definition is what keeps the middleware and that test from disagreeing.
 *
 * Note the split of responsibility, which is deliberate:
 *   * this middleware answers "is there a session at all?" — cheap, edge-side;
 *   * the layouts and API routes answer "may *this* role in?", against fresh data.
 */
const isProtected = isProtectedPath
const isPhoneGated = isPhoneGatedPath

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
