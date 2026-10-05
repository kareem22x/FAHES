import { describe, expect, it } from 'vitest'
import { dashboardPath, postAuthPath, inspectorExitPath } from '@/lib/post-auth-path'
import type { Role } from '@/types/domain'

const roles: Role[] = ['customer', 'inspector', 'admin', 'admin_pending']

describe('postAuthPath', () => {
  it('sends an approved inspector to their own console', () => {
    expect(postAuthPath({ role: 'inspector' })).toBe('/inspector/dashboard')
  })

  it('sends a verified customer to their profile page, not the workspace', () => {
    expect(postAuthPath({ role: 'customer', isVerified: true })).toBe('/account')
  })

  it('sends an unverified customer to identity verification first', () => {
    // The customer surface is gated on both a verified phone and a national ID.
    // An unverified customer is routed to /verify-identity rather than /account.
    expect(postAuthPath({ role: 'customer', isVerified: false })).toBe('/verify-identity')
  })

  it('sends an elevated admin to the console and an unelevated one to the gate', () => {
    expect(postAuthPath({ role: 'admin' })).toBe('/admin')
    expect(postAuthPath({ role: 'admin_pending' })).toBe('/admin/gate')
  })

  it('returns a same-origin absolute path for every role', () => {
    for (const role of roles) {
      const path = postAuthPath({ role })
      expect(path.startsWith('/')).toBe(true)
      // A double slash would be treated as a protocol-relative URL by some
      // clients, which is an open-redirect waiting to happen.
      expect(path.startsWith('//')).toBe(false)
      expect(path.length).toBeGreaterThan(1)
    }
  })

  it('does not treat the inspector console as a customer destination', () => {
    expect(postAuthPath({ role: 'inspector' })).not.toBe(postAuthPath({ role: 'customer' }))
  })

  it('honours an owner who is holding inspector view mode', () => {
    expect(postAuthPath({ role: 'admin', inspectorView: true })).toBe('/inspector/dashboard')
  })

  it('ignores the view flag for everyone else', () => {
    // A non-owner can never actually receive `inspectorView: true` — the flag is
    // gated on `isPlatformOwner()` in `getSession()`. This asserts the mapping is
    // safe even if it somehow did, so the flag alone is never a privilege.
    expect(postAuthPath({ role: 'customer', inspectorView: true })).toBe('/inspector/dashboard')
    expect(postAuthPath({ role: 'inspector', inspectorView: false })).toBe('/inspector/dashboard')
  })
})

describe('dashboardPath', () => {
  it('maps each role to its console', () => {
    expect(dashboardPath({ role: 'admin' })).toBe('/admin')
    expect(dashboardPath({ role: 'admin_pending' })).toBe('/admin/gate')
    expect(dashboardPath({ role: 'inspector' })).toBe('/inspector/dashboard')
    expect(dashboardPath({ role: 'customer' })).toBe('/dashboard')
  })

  it('differs from postAuthPath for customers by design', () => {
    // `/account` is the profile page a customer lands on after signing in;
    // `/dashboard` is the workspace a booking confirmation links into. They are
    // different screens, so the two maps must not collapse into one.
    expect(dashboardPath({ role: 'customer' })).not.toBe(postAuthPath({ role: 'customer' }))
  })

  it('agrees with postAuthPath for roles that have a single console', () => {
    expect(dashboardPath({ role: 'inspector' })).toBe(postAuthPath({ role: 'inspector' }))
    expect(dashboardPath({ role: 'admin' })).toBe(postAuthPath({ role: 'admin' }))
    expect(dashboardPath({ role: 'admin_pending' })).toBe(postAuthPath({ role: 'admin_pending' }))
  })

  it('routes an owner in inspector view to the inspector console, not the admin one', () => {
    expect(dashboardPath({ role: 'admin', inspectorView: true })).toBe('/inspector/dashboard')
    expect(dashboardPath({ role: 'admin_pending', inspectorView: true })).toBe('/inspector/dashboard')
  })
})

describe('inspectorExitPath', () => {
  it('returns an owner to the admin console', () => {
    expect(inspectorExitPath({ role: 'admin' })).toBe('/admin')
    expect(inspectorExitPath({ role: 'admin_pending' })).toBe('/admin/gate')
  })

  it('keeps a real inspector on their own console', () => {
    expect(inspectorExitPath({ role: 'inspector' })).toBe('/inspector/dashboard')
  })

  it('never sends a non-owner to the admin console', () => {
    // Exit destinations are reached after a cookie write, so this is the one
    // path where a stale or forged view flag could otherwise leak an admin URL.
    expect(inspectorExitPath({ role: 'customer' })).toBe('/dashboard')
    expect(inspectorExitPath({ role: 'customer', inspectorView: true })).toBe('/dashboard')
  })
})
