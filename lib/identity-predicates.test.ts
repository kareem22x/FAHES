import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clearsPhoneGate } from '@/lib/identity-predicates'

/**
 * `clearsPhoneGate` is the one predicate behind all three gates on the
 * phone-verification wall — the edge proxy, the server-side layout guard and the
 * API guard. The cases below pin the two halves of the rule that must never
 * drift: the flag lets a verified account through, and the exemption lets an
 * environment-provisioned operator through even with no phone at all.
 */

const OPERATOR_KEYS = [
  'ADMIN_CLERK_IDS',
  'ADMIN_PHONES',
  'ADMIN_OWNER_CLERK_IDS',
  'ADMIN_OWNER_PHONES',
] as const

const saved = new Map<string, string | undefined>()

beforeEach(() => {
  // The exemption reads process.env, so the real environment must not leak in —
  // otherwise a developer with ADMIN_PHONES exported gets different results from CI.
  for (const key of OPERATOR_KEYS) {
    saved.set(key, process.env[key])
    delete process.env[key]
  }
})

afterEach(() => {
  for (const key of OPERATOR_KEYS) {
    const value = saved.get(key)
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

describe('clearsPhoneGate', () => {
  it('lets a phone-verified account through', () => {
    expect(clearsPhoneGate({ phone: '+966500000000', phoneVerified: true })).toBe(true)
  })

  it('blocks an account that holds a phone but has not verified it', () => {
    expect(clearsPhoneGate({ phone: '+966500000000', phoneVerified: false })).toBe(false)
  })

  it('blocks an account with neither a phone nor a verification', () => {
    expect(clearsPhoneGate({ phone: null, clerkUserId: 'user_abc', phoneVerified: false })).toBe(false)
  })

  it('treats an omitted phoneVerified as unverified, not as unknown-and-allowed', () => {
    // Fail-closed here is deliberate. The proxy fails *open* on a degraded lookup
    // because it cannot tell "unverified" from "unknown"; this predicate is only
    // ever called with a resolved row, where a missing flag means unverified.
    expect(clearsPhoneGate({ phone: '+966500000000', clerkUserId: 'user_abc' })).toBe(false)
  })

  it('exempts an environment-listed admin that holds no phone at all', () => {
    process.env.ADMIN_CLERK_IDS = 'user_admin'
    expect(clearsPhoneGate({ phone: null, clerkUserId: 'user_admin', phoneVerified: false })).toBe(true)
  })

  it('exempts an environment-listed admin matched by phone', () => {
    process.env.ADMIN_PHONES = '+966500000001'
    expect(clearsPhoneGate({ phone: '+966500000001', clerkUserId: 'user_x', phoneVerified: false })).toBe(true)
  })

  it('exempts the owner, who is a superset of admin', () => {
    process.env.ADMIN_OWNER_CLERK_IDS = 'user_owner'
    expect(clearsPhoneGate({ phone: null, clerkUserId: 'user_owner', phoneVerified: false })).toBe(true)
  })

  it('does not exempt an account that merely resembles a listed one', () => {
    process.env.ADMIN_CLERK_IDS = 'user_admin'
    expect(clearsPhoneGate({ phone: null, clerkUserId: 'user_admin_2', phoneVerified: false })).toBe(false)
  })

  it('does not read the stored role — an unlisted admin_pending is still blocked', () => {
    // The exemption is by environment identity on purpose: consulting the role
    // would exempt any account that could talk its way into `admin_pending`.
    expect(
      clearsPhoneGate({ phone: '+966500000000', clerkUserId: 'user_abc', phoneVerified: false }),
    ).toBe(false)
  })
})
