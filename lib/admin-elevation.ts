import { hmacBase64Url, timingSafeEqual } from '@/lib/web-crypto'

export const ADMIN_ELEVATION_COOKIE = 'fahes_admin_elevation'

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
