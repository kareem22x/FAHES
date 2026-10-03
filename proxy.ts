import { NextRequest, NextResponse } from 'next/server'
import { clerkMiddleware } from '@clerk/nextjs/server'
import { logAuditEvent } from '@/lib/audit'

/**
 * Prefixes that require a signed-in identity. This is an authentication gate
 * only — role authorization (`customer` / `inspector` / `admin`) stays in the
 * server components and API routes, where the Supabase lookup is cheap and
 * where the decision can be made against fresh data. Gating here means an
 * anonymous request never even starts rendering the protected tree.
 */
const PROTECTED_PREFIXES = ['/admin', '/inspector', '/dashboard', '/account', '/requests'] as const

function isProtected(pathname: string) {
  return PROTECTED_PREFIXES.some(
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
].join('; ')

/**
 * Permissions policy.
 *
 * The default denies camera, microphone and geolocation outright. That is right
 * for the public site — nothing there needs a sensor, and denying by default is
 * free.
 *
 * It is wrong for the inspector's field surface. Capturing a vehicle's position
 * and photographing it from the device camera is the *point* of that screen, and
 * the audit trail is only legally meaningful if the coordinates are real. A
 * bare `geolocation=()` denies the feature to the origin that owns it, so the
 * whole field workflow silently degrades to "location unavailable".
 *
 * So the restriction is scoped rather than dropped: `self` on the field route
 * only, everything else denied. `camera` is `self` for the same reason — the
 * mandatory-photo step uses `<input capture="environment">`.
 *
 * Microphone stays denied everywhere: nothing in this product records audio.
 */
function permissionsPolicy(pathname: string) {
  const isField = pathname === '/inspector/field' || pathname.startsWith('/inspector/field/')
  if (isField) {
    return 'camera=(self), microphone=(), geolocation=(self)'
  }
  return 'camera=(), microphone=(), geolocation=()'
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
