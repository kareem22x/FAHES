/**
 * Basemap imagery, chosen by theme.
 *
 * ── Why there is no Google Maps here ───────────────────────────────────────
 * Google's JavaScript API needs a billing-enabled key, and a map that renders a
 * grey "for development purposes only" watermark until someone pastes one is
 * worse than no map at all. Leaflet against open tiles needs no key, no
 * account, and no third-party script: the whole renderer ships in our bundle.
 *
 * ── Why CARTO rather than openstreetmap.org directly ───────────────────────
 * The `tile.openstreetmap.org` policy explicitly forbids heavy or systematic
 * use and has no dark variant, which this product needs. CARTO's basemaps are
 * OpenStreetMap data re-styled, are free to use with attribution, and come in a
 * matched light/dark pair — so switching themes changes the imagery without
 * changing the place names underneath it.
 *
 * `NEXT_PUBLIC_MAP_TILE_URL` overrides the whole thing. It exists so that a
 * provider change is a Vercel environment variable rather than a deploy.
 */

export type MapTheme = 'light' | 'dark'

export type TileSource = {
  readonly url: string
  readonly attribution: string
  /** CARTO shards across four hosts. Leaflet's default is three. */
  readonly subdomains: readonly string[]
  readonly maxZoom: number
}

const CARTO_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'

/** Leaflet's default subdomain set, used when a source does not shard. */
export const DEFAULT_SUBDOMAINS: readonly string[] = ['a', 'b', 'c']

export const TILE_SOURCES: Record<MapTheme, TileSource> = {
  light: {
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
    attribution: CARTO_ATTRIBUTION,
    subdomains: ['a', 'b', 'c', 'd'],
    maxZoom: 20,
  },
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
    attribution: CARTO_ATTRIBUTION,
    subdomains: ['a', 'b', 'c', 'd'],
    maxZoom: 20,
  },
}

/**
 * Anything that is not exactly `'dark'` is light.
 *
 * The theme arrives from a DOM attribute that a third-party provider writes, so
 * it is an untrusted string as far as this module is concerned. Falling back to
 * light rather than throwing matches the product's light-first default.
 */
export function normalizeTheme(value: unknown): MapTheme {
  return value === 'dark' ? 'dark' : 'light'
}

/**
 * The tile source for a theme, honouring the environment override.
 *
 * The override replaces the URL only. Attribution and the subdomain set stay
 * with the theme, because a custom endpoint that does not shard simply ignores
 * the unused `{s}` — whereas dropping the attribution would breach the terms of
 * whichever provider is in use.
 */
export function tileSourceFor(theme: unknown): TileSource {
  const source = TILE_SOURCES[normalizeTheme(theme)]
  const override = process.env.NEXT_PUBLIC_MAP_TILE_URL?.trim()
  return override ? { ...source, url: override } : source
}
