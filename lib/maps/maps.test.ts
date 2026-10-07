import { afterEach, describe, expect, it } from 'vitest'
import { HOME_CENTER, SINGLE_POINT_ZOOM, viewFor } from './bounds'
import { TILE_SOURCES, normalizeTheme, tileSourceFor } from './tiles'
import { isPlottable, plottableMarkers, type MapMarker } from './types'

function marker(overrides: Partial<MapMarker> = {}): MapMarker {
  return {
    id: overrides.id ?? 'm1',
    latitude: overrides.latitude ?? 26.4207,
    longitude: overrides.longitude ?? 50.0888,
    tone: overrides.tone ?? 'good',
    title: overrides.title ?? 'فاحص',
    ...overrides,
  }
}

describe('normalizeTheme', () => {
  it('accepts the one value that means dark', () => {
    expect(normalizeTheme('dark')).toBe('dark')
  })

  it('falls back to light for everything else, including near misses', () => {
    // The value comes from a DOM attribute written by a third-party provider,
    // so it is untrusted input rather than a union we can rely on.
    for (const value of ['light', '', 'DARK', 'Dark', null, undefined, 42, {}, []]) {
      expect(normalizeTheme(value)).toBe('light')
    }
  })
})

describe('tileSourceFor', () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_MAP_TILE_URL
  })

  it('picks the matching basemap for the theme', () => {
    expect(tileSourceFor('light').url).toBe(TILE_SOURCES.light.url)
    expect(tileSourceFor('dark').url).toBe(TILE_SOURCES.dark.url)
  })

  it('serves different imagery per theme — a dark map must not be the light one', () => {
    expect(tileSourceFor('dark').url).not.toBe(tileSourceFor('light').url)
  })

  it('always carries attribution, because the tiles are licensed', () => {
    for (const theme of ['light', 'dark']) {
      expect(tileSourceFor(theme).attribution).toContain('OpenStreetMap')
      expect(tileSourceFor(theme).attribution).toContain('CARTO')
    }
  })

  it('lets the endpoint be overridden without losing attribution or sharding', () => {
    process.env.NEXT_PUBLIC_MAP_TILE_URL = 'https://tiles.example.com/{z}/{x}/{y}.png'
    const source = tileSourceFor('dark')
    expect(source.url).toBe('https://tiles.example.com/{z}/{x}/{y}.png')
    expect(source.attribution).toContain('OpenStreetMap')
    expect(source.subdomains.length).toBeGreaterThan(0)
  })

  it('ignores a blank override rather than emitting an empty tile URL', () => {
    process.env.NEXT_PUBLIC_MAP_TILE_URL = '   '
    expect(tileSourceFor('light').url).toBe(TILE_SOURCES.light.url)
  })
})

describe('isPlottable', () => {
  it('accepts a real coordinate pair', () => {
    expect(isPlottable({ latitude: 26.42, longitude: 50.08 })).toBe(true)
  })

  it('rejects the values a database hands back for "no fix"', () => {
    expect(isPlottable({ latitude: Number.NaN, longitude: 50.08 })).toBe(false)
    expect(isPlottable({ latitude: 26.42, longitude: Number.NaN })).toBe(false)
    expect(isPlottable({ latitude: Number.POSITIVE_INFINITY, longitude: 50.08 })).toBe(false)
  })

  it('rejects out-of-range values instead of letting Leaflet wrap them', () => {
    // Leaflet happily renders latitude 91 by wrapping it, which puts a marker
    // somewhere the operator did not ask for rather than failing loudly.
    expect(isPlottable({ latitude: 91, longitude: 50 })).toBe(false)
    expect(isPlottable({ latitude: 26, longitude: 181 })).toBe(false)
    expect(isPlottable({ latitude: -90, longitude: 180 })).toBe(true)
  })
})

describe('plottableMarkers', () => {
  it('keeps the good ones and drops the rest', () => {
    const kept = plottableMarkers([
      marker({ id: 'a' }),
      marker({ id: 'b', latitude: Number.NaN }),
      marker({ id: 'c', longitude: 999 }),
    ])
    expect(kept.map((m) => m.id)).toEqual(['a'])
  })

  it('never throws on an empty list', () => {
    expect(plottableMarkers([])).toEqual([])
  })
})

describe('viewFor', () => {
  it('reports empty rather than inventing a view', () => {
    expect(viewFor([])).toEqual({ kind: 'empty' })
  })

  it('treats a list of unplottable markers as empty', () => {
    expect(viewFor([marker({ latitude: Number.NaN })]).kind).toBe('empty')
  })

  it('uses a fixed zoom for a single marker, not zero-area bounds', () => {
    // Fitting zero-area bounds makes Leaflet zoom to maximum.
    const view = viewFor([marker()])
    expect(view).toEqual({ kind: 'point', center: [26.4207, 50.0888], zoom: SINGLE_POINT_ZOOM })
  })

  it('still uses the fixed zoom when several markers share one spot', () => {
    // The case a naive `length === 1` check gets wrong.
    const view = viewFor([
      marker({ id: 'a' }),
      marker({ id: 'b' }),
      marker({ id: 'c' }),
    ])
    expect(view.kind).toBe('point')
  })

  it('fits bounds once the markers actually spread out', () => {
    const view = viewFor([
      marker({ id: 'dammam', latitude: 26.4207, longitude: 50.0888 }),
      marker({ id: 'jubail', latitude: 27.0046, longitude: 49.646 }),
    ])
    expect(view).toEqual({
      kind: 'bounds',
      bounds: [
        [26.4207, 49.646],
        [27.0046, 50.0888],
      ],
    })
  })

  it('computes the envelope from the extremes, not the first and last marker', () => {
    const view = viewFor([
      marker({ id: 'mid', latitude: 26.5, longitude: 50.0 }),
      marker({ id: 'north', latitude: 27.5, longitude: 49.5 }),
      marker({ id: 'south', latitude: 25.0, longitude: 51.0 }),
    ])
    expect(view).toEqual({
      kind: 'bounds',
      bounds: [
        [25.0, 49.5],
        [27.5, 51.0],
      ],
    })
  })

  it('spreads on one axis only when that is all the data has', () => {
    // Two inspectors at the same longitude are still a bounds fit; only *both*
    // axes being flat is the degenerate case.
    const view = viewFor([
      marker({ id: 'a', latitude: 26.0, longitude: 50.0 }),
      marker({ id: 'b', latitude: 27.0, longitude: 50.0 }),
    ])
    expect(view.kind).toBe('bounds')
  })

  it('ignores unplottable markers when computing the envelope', () => {
    const view = viewFor([
      marker({ id: 'good', latitude: 26.0, longitude: 50.0 }),
      marker({ id: 'bad', latitude: Number.NaN, longitude: 12.0 }),
    ])
    // Only one usable point survives, so this is the single-point case — not a
    // bounds fit that would stretch to latitude NaN.
    expect(view).toEqual({ kind: 'point', center: [26.0, 50.0], zoom: SINGLE_POINT_ZOOM })
  })

  it('exposes a home view inside the served region', () => {
    expect(HOME_CENTER[0]).toBeGreaterThan(24)
    expect(HOME_CENTER[0]).toBeLessThan(28)
    expect(HOME_CENTER[1]).toBeGreaterThan(48)
    expect(HOME_CENTER[1]).toBeLessThan(52)
  })
})
