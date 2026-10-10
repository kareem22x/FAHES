import { describe, expect, it } from 'vitest'
import { capabilitiesFor } from '@/lib/app-capabilities'

/**
 * The app renders whatever this function returns, so these cases are the
 * contract between the server and every screen in the mobile app. A wrong tab
 * here is a tab that 401s — which is exactly the defect this module exists to
 * prevent, so each role's shape is pinned explicitly rather than asserted
 * loosely.
 */

const segments = (caps: ReturnType<typeof capabilitiesFor>) => caps.tabs.map((t) => t.segment)

describe('capabilitiesFor', () => {
  it('gives a customer the four consumer tabs and lands on home', () => {
    const caps = capabilitiesFor({ role: 'customer', isPlatformOwner: false })
    expect(caps.surface).toBe('customer')
    expect(caps.surfaces).toEqual(['customer'])
    expect(segments(caps)).toEqual(['index', 'orders', 'notifications', 'account'])
    expect(caps.home).toBe('/(tabs)')
    expect(caps.can.readOwnRequests).toBe(true)
    expect(caps.can.readFieldWork).toBe(false)
    expect(caps.can.openConsole).toBe(false)
  })

  it('gives an inspector the job tabs and lands on jobs, never on orders', () => {
    const caps = capabilitiesFor({ role: 'inspector', isPlatformOwner: false })
    expect(caps.surface).toBe('inspector')
    expect(caps.surfaces).toEqual(['inspector'])
    expect(segments(caps)).toEqual(['jobs', 'wallet', 'notifications', 'account'])
    expect(caps.home).toBe('/(tabs)/jobs')
    // The load-bearing one: an inspector must not be sent to a customer endpoint.
    expect(caps.can.readOwnRequests).toBe(false)
    expect(caps.can.readFieldWork).toBe(true)
    expect(caps.can.requestPayout).toBe(true)
  })

  it('gives a plain admin the console only, and no inspector surface', () => {
    const caps = capabilitiesFor({ role: 'admin', isPlatformOwner: false })
    expect(caps.surfaces).toEqual(['admin'])
    expect(segments(caps)).toEqual(['console', 'notifications', 'account'])
    expect(caps.can.readFieldWork).toBe(false)
    expect(caps.can.openConsole).toBe(true)
  })

  it('parks an admin_pending account on the gate, with no console data', () => {
    const caps = capabilitiesFor({ role: 'admin_pending', isPlatformOwner: false })
    expect(caps.surface).toBe('pending')
    expect(segments(caps)).toEqual(['gate', 'account'])
    expect(caps.home).toBe('/(tabs)/gate')
    // The gate exists precisely because the console must not render yet.
    expect(caps.can.openConsole).toBe(false)
  })

  it('gives the owner all three surfaces, defaulting to the admin console', () => {
    const caps = capabilitiesFor({ role: 'admin', isPlatformOwner: true })
    expect(caps.surfaces).toEqual(['customer', 'inspector', 'admin'])
    expect(caps.surface).toBe('admin')
    expect(caps.can.openConsole).toBe(true)
  })

  it('honours a requested surface for the owner', () => {
    const caps = capabilitiesFor({ role: 'admin', isPlatformOwner: true, requestedSurface: 'inspector' })
    expect(caps.surface).toBe('inspector')
    expect(caps.home).toBe('/(tabs)/jobs')
    expect(caps.can.readFieldWork).toBe(true)
  })

  it('honours a requested customer surface for the owner', () => {
    const caps = capabilitiesFor({ role: 'admin', isPlatformOwner: true, requestedSurface: 'customer' })
    expect(caps.surface).toBe('customer')
    // This is the pair that matters: the owner standing in the customer surface
    // must be told they may read requests, or the app shows an error screen.
    expect(caps.can.readOwnRequests).toBe(true)
  })

  it('ignores a requested surface the account does not hold, without failing', () => {
    // Not an attack worth a 400: it is a stale screen in an app whose session
    // changed underneath it. The correct answer is the account's own surface.
    const caps = capabilitiesFor({ role: 'customer', isPlatformOwner: false, requestedSurface: 'admin' })
    expect(caps.surface).toBe('customer')
    expect(caps.can.openConsole).toBe(false)
  })

  it('ignores a requested surface that is not a surface at all', () => {
    const caps = capabilitiesFor({ role: 'inspector', isPlatformOwner: false, requestedSurface: 'root' })
    expect(caps.surface).toBe('inspector')
  })

  it('never hands out a surface outside the allowed list', () => {
    const roles = ['customer', 'inspector', 'admin', 'admin_pending'] as const
    for (const role of roles) {
      for (const owner of [false, true]) {
        const caps = capabilitiesFor({ role, isPlatformOwner: owner })
        expect(caps.surfaces).toContain(caps.surface)
        expect(caps.tabs.length).toBeGreaterThan(0)
        expect(caps.home.startsWith('/(tabs)')).toBe(true)
      }
    }
  })
})
