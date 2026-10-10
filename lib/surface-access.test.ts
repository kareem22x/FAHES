import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mayUseCustomerSurface } from '@/lib/surface-access'

/**
 * `mayUseCustomerSurface` is the customer-side counterpart to
 * `isInspectorSession`. Its whole reason for existing is that two guards
 * disagreed: `requireRoles(['customer'])` admits an owner, while
 * `GET /api/customer/requests` tested `role !== 'customer'` and answered 401.
 * The cases below pin the rule so the two cannot drift again.
 */

const OPERATOR_KEYS = [
  'ADMIN_CLERK_IDS',
  'ADMIN_PHONES',
  'ADMIN_OWNER_CLERK_IDS',
  'ADMIN_OWNER_PHONES',
] as const

const saved = new Map<string, string | undefined>()

beforeEach(() => {
  // The owner check reads process.env; the ambient environment must not leak in,
  // or a developer with ADMIN_PHONES exported gets different results from CI.
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

describe('mayUseCustomerSurface', () => {
  it('admits a customer', () => {
    expect(mayUseCustomerSurface({ role: 'customer', clerkUserId: 'user_c' })).toBe(true)
  })

  it('refuses an inspector who is not the owner', () => {
    // An inspector is not a customer and not the owner. They have their own
    // surface; the two predicates are deliberately not each other's negation.
    expect(mayUseCustomerSurface({ role: 'inspector', clerkUserId: 'user_i' })).toBe(false)
  })

  it('admits the owner by Clerk id even with no phone at all', () => {
    // The account that motivated the sibling inspector predicate signs in by
    // email only and holds no phone number, so a phone-only check would fail
    // for exactly the person it was written for.
    process.env.ADMIN_OWNER_CLERK_IDS = 'user_owner'
    expect(mayUseCustomerSurface({ role: 'admin', phone: null, clerkUserId: 'user_owner' })).toBe(true)
  })

  it('admits the owner by phone', () => {
    process.env.ADMIN_OWNER_PHONES = '+966500000009'
    expect(mayUseCustomerSurface({ role: 'admin', phone: '+966500000009', clerkUserId: null })).toBe(true)
  })

  it('refuses a plain admin who is not the owner', () => {
    // A non-owner admin has no consumer line of business; admitting them would
    // attribute consumer actions to an account that never had one.
    process.env.ADMIN_CLERK_IDS = 'user_admin'
    expect(mayUseCustomerSurface({ role: 'admin', phone: null, clerkUserId: 'user_admin' })).toBe(false)
  })

  it('refuses an admin_pending account', () => {
    expect(mayUseCustomerSurface({ role: 'admin_pending', phone: null, clerkUserId: 'user_p' })).toBe(false)
  })

  it('refuses a null or undefined session', () => {
    expect(mayUseCustomerSurface(null)).toBe(false)
    expect(mayUseCustomerSurface(undefined)).toBe(false)
  })

  it('does not admit an account that merely resembles a listed owner', () => {
    process.env.ADMIN_OWNER_CLERK_IDS = 'user_owner'
    expect(mayUseCustomerSurface({ role: 'admin', clerkUserId: 'user_owner_2' })).toBe(false)
  })
})
