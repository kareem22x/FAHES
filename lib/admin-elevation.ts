import { isSurface, type Surface } from '@/lib/surfaces'
import { hmacBase64Url, timingSafeEqual } from '@/lib/web-crypto'

export const ADMIN_ELEVATION_COOKIE = 'fahes_admin_elevation'

/**
 * Inspector *view mode* cookie — the owner-only dual-role toggle.
 *
 * A site owner is an admin by construction (ADMIN_OWNER_* → isPlatformAdmin),
 * and `getSession()` resolves the stored role as `admin` before it ever looks
 * at `inspector_status`. So an owner can never *be* an inspector: 16 API routes
 * that test `session.role !== 'inspector'` would refuse them, and the field
 * dashboard would render while every single action 403s.
 *
 * The fix is a view mode rather than a role change — the owner keeps the admin
 * role and additionally holds an inspector *surface* they can enter and leave.
 *
 * Security shape: the cookie is an ephemeral, session-bound *switch*, not a
 * grant. It is only ever honoured together with `isPlatformOwner()` on the live
 * session, so forging it buys nothing — a non-owner presenting it is still a
 * non-owner. Signing it also binds it to the Clerk session id, so it dies with
 * the session and cannot be replayed after the owner signs in again.
 */
export const INSPECTOR_VIEW_COOKIE = 'fahes_inspector_view'

/**
 * The general surface cookie, which supersedes `INSPECTOR_VIEW_COOKIE`.
 *
 * The owner can now stand in three surfaces (client / inspector / support)
 * rather than toggling a single boolean, so the payload carries the surface
 * name instead of implying one. It is a *separate* cookie rather than a change
 * to the old payload on purpose: an owner who is already inside the inspector
 * surface when this ships still holds the old cookie, and rewriting the format
 * under them would silently drop them back to the admin console.
 *
 * `verifySurface` is therefore consulted first and `verifyInspectorView` second,
 * as a migration read. The old cookie is never written again, so it ages out
 * with the session.
 */
export const SURFACE_COOKIE = 'fahes_surface'

type AdminElevationPayload = {
  v: 2
  sub: string
  exp: number
}

type SurfacePayload = {
  v: 3
  sub: string
  surface: Surface
  exp: number
}

type SignedPayload = AdminElevationPayload | SurfacePayload

function secret() {
  const value = process.env.SESSION_SECRET || process.env.APP_SECRET
  if (!value || value.length < 24 || value.includes('change_this')) {
    throw new Error('SESSION_SECRET غير مهيأ بشكل آمن')
  }
  return value
}

function encode(value: SignedPayload) {
  return btoa(new TextEncoder().encode(JSON.stringify(value)).reduce(
    (binary, byte) => binary + String.fromCharCode(byte),
    '',
  )).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function decode(value: string): SignedPayload {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4)
  const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0))
  return JSON.parse(new TextDecoder().decode(bytes)) as SignedPayload
}

/**
 * Verifies the signature and the session binding, returning the raw payload.
 *
 * Shared by every reader below so the two checks that actually matter —
 * "is this token really ours" and "is it really this session's" — cannot drift
 * apart between the surface and the elevation path.
 */
async function openToken(token: string | undefined, sessionId: string): Promise<SignedPayload | null> {
  if (!token || !token.includes('.')) return null
  const [body, signature] = token.split('.')
  if (!body || !signature) return null

  try {
    const expected = await hmacBase64Url(secret(), body)
    if (!timingSafeEqual(signature, expected)) return null
    const payload = decode(body)
    if (payload.sub !== sessionId) return null
    if (payload.exp * 1000 <= Date.now()) return null
    return payload
  } catch {
    return null
  }
}

export async function signAdminElevation(sessionId: string) {
  const payload: AdminElevationPayload = {
    v: 2,
    sub: sessionId,
    exp: Math.floor(Date.now() / 1000) + 4 * 60 * 60,
  }
  const body = encode(payload)
  return `${body}.${await hmacBase64Url(secret(), body)}`
}

export async function verifyAdminElevation(token: string | undefined, sessionId: string) {
  const payload = await openToken(token, sessionId)
  return payload?.v === 2
}

/**
 * Inspector view mode is deliberately **not** time-boxed like the elevation
 * cookie: it is a surface switch, not a privilege escalation. It stays valid
 * for the life of the Clerk session (`exp` is far in the future) and dies with
 * the session because the payload is bound to the session id.
 */
export async function signInspectorView(sessionId: string) {
  const payload: AdminElevationPayload = {
    v: 2,
    sub: sessionId,
    exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
  }
  const body = encode(payload)
  return `${body}.${await hmacBase64Url(secret(), body)}`
}

export async function verifyInspectorView(token: string | undefined, sessionId: string) {
  const payload = await openToken(token, sessionId)
  return payload?.v === 2
}

/**
 * Signs the surface the operator is standing in.
 *
 * Same lifetime and same binding as the inspector-view cookie it replaces: long
 * enough to survive a working session, and dead the moment the Clerk session it
 * names ends.
 */
export async function signSurface(sessionId: string, surface: Surface) {
  const payload: SurfacePayload = {
    v: 3,
    sub: sessionId,
    surface,
    exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
  }
  const body = encode(payload)
  return `${body}.${await hmacBase64Url(secret(), body)}`
}

/**
 * Resolves the surface held in the cookie, or `null` when there is none.
 *
 * Returning `null` — rather than defaulting to a surface — is what lets the
 * caller distinguish "no surface chosen" (the ordinary admin console) from "the
 * client surface". The value is validated against the known set, so a token
 * that verifies but carries an unknown surface (an older or newer build) is
 * treated as absent instead of being passed through to a router.
 */
export async function verifySurface(
  token: string | undefined,
  sessionId: string,
): Promise<Surface | null> {
  const payload = await openToken(token, sessionId)
  if (payload?.v !== 3) return null
  return isSurface(payload.surface) ? payload.surface : null
}
