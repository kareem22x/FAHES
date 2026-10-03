import { afterEach, describe, expect, it } from 'vitest'
import {
  ADMIN_ELEVATION_COOKIE,
  INSPECTOR_VIEW_COOKIE,
  signAdminElevation,
  signInspectorView,
  verifyAdminElevation,
  verifyInspectorView,
} from '@/lib/admin-elevation'

const SECRET = 'test-only-admin-elevation-secret-long-enough'

describe('admin elevation tokens', () => {
  afterEach(() => {
    delete process.env.SESSION_SECRET
  })

  it('only elevates the Clerk session used to create the token', async () => {
    process.env.SESSION_SECRET = 'test-only-admin-elevation-secret-long-enough'
    const token = await signAdminElevation('session-one')

    await expect(verifyAdminElevation(token, 'session-one')).resolves.toBe(true)
    await expect(verifyAdminElevation(token, 'session-two')).resolves.toBe(false)
  })

  it('fails closed when the token is missing or malformed', async () => {
    process.env.SESSION_SECRET = 'test-only-admin-elevation-secret-long-enough'

    await expect(verifyAdminElevation(undefined, 'session-one')).resolves.toBe(false)
    await expect(verifyAdminElevation('broken.token', 'session-one')).resolves.toBe(false)
  })
})

/**
 * The inspector-view cookie is a *surface switch*, not a privilege grant — but
 * it is still a bearer token, so it must be signed, session-bound and
 * tamper-proof. The guard in `lib/field/access.ts` leans on exactly that: it is
 * what makes "a forged cookie buys nothing" true rather than hopeful.
 */
describe('inspector view cookie', () => {
  afterEach(() => {
    delete process.env.SESSION_SECRET
  })

  it('round-trips for the session that signed it', async () => {
    process.env.SESSION_SECRET = SECRET
    const token = await signInspectorView('session-one')
    await expect(verifyInspectorView(token, 'session-one')).resolves.toBe(true)
  })

  it('is bound to one session and cannot be replayed into another', async () => {
    process.env.SESSION_SECRET = SECRET
    const token = await signInspectorView('session-one')
    await expect(verifyInspectorView(token, 'session-two')).resolves.toBe(false)
  })

  it('refuses a missing, empty or malformed token', async () => {
    process.env.SESSION_SECRET = SECRET
    for (const token of [undefined, '', 'no-dot-here', '.', 'body.', '.sig']) {
      await expect(verifyInspectorView(token, 'session-one')).resolves.toBe(false)
    }
  })

  it('refuses a tampered payload even with the original signature', async () => {
    process.env.SESSION_SECRET = SECRET
    const token = await signInspectorView('session-one')
    const [body, signature] = token.split('.')

    // Re-encode modified claims (a far-future expiry) keeping the signature.
    const forgedBody = btoa(JSON.stringify({ v: 2, sub: 'session-one', exp: 9_999_999_999 }))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
    await expect(verifyInspectorView(`${forgedBody}.${signature}`, 'session-one')).resolves.toBe(false)
    await expect(verifyInspectorView(`${body}.${signature}x`, 'session-one')).resolves.toBe(false)
  })

  it('refuses a token signed with a different secret', async () => {
    process.env.SESSION_SECRET = SECRET
    const token = await signInspectorView('session-one')
    process.env.SESSION_SECRET = 'a-completely-different-secret-value-here'
    await expect(verifyInspectorView(token, 'session-one')).resolves.toBe(false)
  })

  it('signs with payload version 2 so an older format cannot be replayed', async () => {
    process.env.SESSION_SECRET = SECRET
    const token = await signInspectorView('session-one')
    const [body] = token.split('.')
    const payload = JSON.parse(Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString())
    expect(payload).toMatchObject({ v: 2, sub: 'session-one' })
  })

  it('uses its own cookie name, so leaving one surface cannot drop the other', () => {
    expect(ADMIN_ELEVATION_COOKIE).toBe('fahes_admin_elevation')
    expect(INSPECTOR_VIEW_COOKIE).toBe('fahes_inspector_view')
    expect(INSPECTOR_VIEW_COOKIE).not.toBe(ADMIN_ELEVATION_COOKIE)
  })

  it('refuses to sign when the secret is unset, short or a placeholder', async () => {
    for (const secret of ['', 'too-short', 'change_this_in_production_and_long']) {
      process.env.SESSION_SECRET = secret
      await expect(signInspectorView('session-one')).rejects.toThrow()
    }
  })

  it('produces a different payload from the elevation token for one session', async () => {
    process.env.SESSION_SECRET = SECRET
    // Same secret, same session — but the two must not be interchangeable, or
    // holding one would silently grant the other.
    const elevation = await signAdminElevation('session-one')
    const view = await signInspectorView('session-one')
    expect(elevation.split('.')[0]).not.toBe(view.split('.')[0])
  })
})
