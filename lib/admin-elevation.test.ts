import { afterEach, describe, expect, it } from 'vitest'
import { signAdminElevation, verifyAdminElevation } from '@/lib/admin-elevation'

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
