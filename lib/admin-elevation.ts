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

type AdminElevationPayload = {
  v: 2
  sub: string
  exp: number
}

function secret() {
  const value = process.env.SESSION_SECRET || process.env.APP_SECRET
  if (!value || value.length < 24 || value.includes('change_this')) {
    throw new Error('SESSION_SECRET غير مهيأ بشكل آمن')
  }
  return value
}

function encode(value: AdminElevationPayload) {
  return btoa(new TextEncoder().encode(JSON.stringify(value)).reduce(
    (binary, byte) => binary + String.fromCharCode(byte),
    '',
  )).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function decode(value: string): AdminElevationPayload {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4)
  const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0))
  return JSON.parse(new TextDecoder().decode(bytes)) as AdminElevationPayload
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
  if (!token || !token.includes('.')) return false
  const [body, signature] = token.split('.')
  if (!body || !signature) return false

  try {
    const expected = await hmacBase64Url(secret(), body)
    if (!timingSafeEqual(signature, expected)) return false
    const payload = decode(body)
    return payload.v === 2 && payload.sub === sessionId && payload.exp * 1000 > Date.now()
  } catch {
    return false
  }
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
  return verifyAdminElevation(token, sessionId)
}
