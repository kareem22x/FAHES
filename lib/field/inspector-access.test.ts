import { describe, expect, it } from 'vitest'
import { isInspectorSession, isPlatformOwnerSession } from '@/lib/field/inspector-access'
import { isApprovedInspector } from '@/lib/identity-predicates'
import type { InspectorStatus } from '@/types/domain'
/**
 * The environment variables the owner/admin predicates read. Set here rather
 * than in a setup file so each test file declares the configuration it assumes.
 */
process.env.ADMIN_OWNER_CLERK_IDS = 'user_OWNER'
process.env.ADMIN_OWNER_PHONES = '0551111111'
process.env.ADMIN_CLERK_IDS = 'user_ADMIN'
process.env.ADMIN_PHONES = '0552222222'

describe('isInspectorSession', () => {
  it('admits an approved inspector', () => {
    expect(isInspectorSession({ role: 'inspector' })).toBe(true)
  })

  it('refuses a customer and an anonymous visitor', () => {
    expect(isInspectorSession({ role: 'customer' })).toBe(false)
    expect(isInspectorSession(null)).toBe(false)
    expect(isInspectorSession(undefined)).toBe(false)
  })

  it('admits a platform owner regardless of the view cookie', () => {
    // Ownership alone is the test. The account that motivated this module has no
    // phone number at all — it signs in with an email address — so the Clerk-ID
    // arm is the one that matters.
    expect(isInspectorSession({ role: 'admin', clerkUserId: 'user_OWNER' })).toBe(true)
    expect(isInspectorSession({ role: 'admin', inspectorView: true, clerkUserId: 'user_OWNER' })).toBe(true)
    expect(isInspectorSession({ role: 'admin', inspectorView: false, clerkUserId: 'user_OWNER' })).toBe(true)
    expect(isInspectorSession({ role: 'admin', phone: '551111111' })).toBe(true)
    expect(isInspectorSession({ role: 'admin', phone: '+966551111111' })).toBe(true)
    expect(isInspectorSession({ role: 'admin', phone: '0551111111' })).toBe(true)
    expect(isInspectorSession({ role: 'admin', phone: '552222222' })).toBe(false)
  })

  it('admits an owner who reached the surface by URL, with no view cookie', () => {
    // The regression this rule fixes. `requireRoles()` in lib/auth.ts admits an
    // owner on ownership alone, so /inspector/dashboard renders for an owner who
    // opens it directly. These routes then demanded the view cookie and refused
    // every write inside that rendered page with «غير مصرح» — fourteen routes,
    // including saving work cities, sending an offer and claiming an inspection.
    // The page guard and the API guard must not disagree.
    expect(isInspectorSession({ role: 'admin', inspectorView: false, clerkUserId: 'user_OWNER' })).toBe(true)
  })

  it('admits an owner awaiting the admin gate', () => {
    // `admin_pending` is an authenticated admin who has not cleared the access
    // code. As an *owner* they are permanently elevated and already hold every
    // inspector privilege, so the gate must not block their field tooling.
    expect(isInspectorSession({ role: 'admin_pending', clerkUserId: 'user_OWNER' })).toBe(true)
    expect(isInspectorSession({ role: 'admin_pending', clerkUserId: 'user_ADMIN' })).toBe(false)
  })

  it('refuses a non-owner, with or without the view flag', () => {
    // The flag is never sufficient on its own — it is honoured only alongside a
    // live owner check, so a forged cookie buys nothing.
    expect(isInspectorSession({ role: 'admin', inspectorView: true, clerkUserId: 'user_ADMIN' })).toBe(false)
    expect(isInspectorSession({ role: 'admin', inspectorView: true, clerkUserId: 'user_STRANGER' })).toBe(false)
    expect(isInspectorSession({ role: 'admin', inspectorView: true })).toBe(false)
    expect(isInspectorSession({ role: 'admin_pending', inspectorView: true, clerkUserId: 'user_ADMIN' })).toBe(false)
  })
})

describe('isPlatformOwnerSession', () => {
  it('is true for an owner regardless of the view cookie', () => {
    // The regression this predicate exists to prevent: the device lock used to
    // be keyed on the view cookie, so an owner who opened /inspector/dashboard
    // by URL (no cookie) was admitted by the page guard and then refused by the
    // page's own device guard and its own API route.
    expect(isPlatformOwnerSession({ role: 'admin', clerkUserId: 'user_OWNER' })).toBe(true)
    expect(isPlatformOwnerSession({ role: 'admin', inspectorView: true, clerkUserId: 'user_OWNER' })).toBe(true)
    expect(isPlatformOwnerSession({ role: 'admin_pending', clerkUserId: 'user_OWNER' })).toBe(true)
    expect(isPlatformOwnerSession({ role: 'admin', phone: '0551111111' })).toBe(true)
  })

  it('is true even for an owner whose resolved role is inspector', () => {
    // Kept deliberately: the device lock is a roster rule, not a surface rule.
    expect(isPlatformOwnerSession({ role: 'inspector', clerkUserId: 'user_OWNER' })).toBe(true)
  })

  it('is false for every non-owner, including plain admins and real inspectors', () => {
    expect(isPlatformOwnerSession({ role: 'inspector' })).toBe(false)
    expect(isPlatformOwnerSession({ role: 'admin', clerkUserId: 'user_ADMIN' })).toBe(false)
    expect(isPlatformOwnerSession({ role: 'admin_pending', inspectorView: true, clerkUserId: 'user_ADMIN' })).toBe(false)
    expect(isPlatformOwnerSession({ role: 'customer' })).toBe(false)
    expect(isPlatformOwnerSession({ role: 'admin', inspectorView: true })).toBe(false)
    expect(isPlatformOwnerSession(null)).toBe(false)
    expect(isPlatformOwnerSession(undefined)).toBe(false)
  })
})

describe('isApprovedInspector', () => {
  it('accepts only the approved status', () => {
    const accepted: InspectorStatus[] = ['approved']
    const refused: InspectorStatus[] = ['none', 'pending', 'suspended']
    for (const status of accepted) expect(isApprovedInspector({ inspectorStatus: status })).toBe(true)
    for (const status of refused) expect(isApprovedInspector({ inspectorStatus: status })).toBe(false)
  })

  it('treats a missing row as not approved', () => {
    expect(isApprovedInspector(null)).toBe(false)
    expect(isApprovedInspector(undefined)).toBe(false)
  })

  it('does not consult the stored role column', () => {
    // A platform owner promoted from inspector to admin keeps
    // `inspector_status = 'approved'` while `role` becomes `admin` — the
    // promotion writes only `role`. Testing `role` here would lock that account
    // out of its own inspector tooling.
    expect(isApprovedInspector({ inspectorStatus: 'approved' })).toBe(true)
  })
})
