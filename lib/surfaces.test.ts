import { describe, expect, it } from 'vitest'
import {
  SURFACE_HINT,
  SURFACE_HOME,
  SURFACE_LABEL,
  SURFACES,
  isSurface,
  surfaceHomePath,
  type Surface,
} from '@/lib/surfaces'

describe('SURFACES', () => {
  it('is the three operator surfaces, in a stable order', () => {
    expect(SURFACES).toEqual(['customer', 'inspector', 'support'])
  })

  it('has no duplicates', () => {
    // A duplicate would make the switcher render two rows that key on the same
    // value, and React would drop one of them.
    expect(new Set(SURFACES).size).toBe(SURFACES.length)
  })
})

describe('isSurface', () => {
  it('accepts every declared surface', () => {
    for (const surface of SURFACES) expect(isSurface(surface)).toBe(true)
  })

  it('rejects the admin console, which is deliberately not a surface', () => {
    // `null` is how the console is represented. A string spelling of it would
    // collide with the switcher's row keys, which use `'admin'` as the sentinel.
    expect(isSurface('admin')).toBe(false)
  })

  it('rejects values that are not surface names', () => {
    for (const value of ['', 'Customer', 'inspectors', 'support ', 'null', '0']) {
      expect(isSurface(value)).toBe(false)
    }
  })

  it('rejects non-strings', () => {
    for (const value of [null, undefined, 0, 1, true, false, {}, [], ['customer']]) {
      expect(isSurface(value)).toBe(false)
    }
  })

  it('narrows the type', () => {
    const value: unknown = 'inspector'
    if (!isSurface(value)) throw new Error('expected a surface')
    // Type-level assertion: this only compiles if the guard narrowed to Surface.
    const narrowed: Surface = value
    expect(narrowed).toBe('inspector')
  })
})

describe('surfaceHomePath', () => {
  it('maps each surface to its workspace', () => {
    expect(surfaceHomePath('customer')).toBe('/dashboard')
    expect(surfaceHomePath('inspector')).toBe('/inspector/dashboard')
    expect(surfaceHomePath('support')).toBe('/admin/support')
  })

  it('returns a distinct destination per surface', () => {
    // Two surfaces sharing a home would make the switcher's "current" tick
    // ambiguous and make a switch look like it did nothing.
    const paths = SURFACES.map(surfaceHomePath)
    expect(new Set(paths).size).toBe(paths.length)
  })

  it('never returns the admin console root', () => {
    // Leaving every surface is `/admin`; no surface may claim that URL, or the
    // owner could not tell "in a surface" from "in the console".
    for (const surface of SURFACES) expect(surfaceHomePath(surface)).not.toBe('/admin')
  })

  it('returns a same-origin absolute path for every surface', () => {
    for (const surface of SURFACES) {
      const path = surfaceHomePath(surface)
      expect(path.startsWith('/')).toBe(true)
      // A double slash would be read as a protocol-relative URL by some clients.
      expect(path.startsWith('//')).toBe(false)
    }
  })

  it('agrees with the map it is derived from', () => {
    for (const surface of SURFACES) {
      expect(surfaceHomePath(surface)).toBe(SURFACE_HOME[surface])
    }
  })
})

describe('labels and hints', () => {
  it('names every surface in Arabic', () => {
    expect(SURFACE_LABEL.customer).toBe('عميل')
    expect(SURFACE_LABEL.inspector).toBe('فاحص')
    expect(SURFACE_LABEL.support).toBe('دعم فني')
  })

  it('covers every surface with a label and a hint', () => {
    // The switcher iterates SURFACES and reads both records; a missing key would
    // render an empty row rather than fail loudly.
    for (const surface of SURFACES) {
      expect(SURFACE_LABEL[surface]?.trim().length).toBeGreaterThan(0)
      expect(SURFACE_HINT[surface]?.trim().length).toBeGreaterThan(0)
    }
  })

  it('has no keys beyond the declared surfaces', () => {
    // A leftover key would be dead weight that looks meaningful.
    expect(Object.keys(SURFACE_LABEL).sort()).toEqual([...SURFACES].sort())
    expect(Object.keys(SURFACE_HINT).sort()).toEqual([...SURFACES].sort())
    expect(Object.keys(SURFACE_HOME).sort()).toEqual([...SURFACES].sort())
  })

  it('keeps the labels distinct', () => {
    const labels = SURFACES.map((surface) => SURFACE_LABEL[surface])
    expect(new Set(labels).size).toBe(labels.length)
  })
})
