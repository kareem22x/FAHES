/**
 * Basemap imagery, chosen by theme.
 *
 * ── Why there is no Google Maps here ───────────────────────────────────────
 * Google's JavaScript API needs a billing-enabled key, and a map that renders a
 * grey "for development purposes only" watermark until someone pastes one is
 * worse than no map at all. Leaflet against open tiles needs no key, no
 * account, and no third-party script: the whole renderer ships in our bundle.
 *
 * ── Why Esri, and why not CARTO ────────────────────────────────────────────
 * CARTO's basemaps were the first choice: OpenStreetMap data re-styled, free
 * with attribution, and shipped as a matched light/dark pair. They still answer
 * `200 image/png` — which is exactly why the swap was nearly missed. The bodies
 * are 2 KB flat cards reading "API KEY REQUIRED", not map tiles: a real z9 tile
 * is 7 KB and a z13 city tile is 17 KB. **A 200 with a plausible content type
 * proves nothing about an image** — only its size and pixels do. The old
 * `cartodb-basemaps-*.global.ssl.fastly.net` host now serves the same
 * placeholder, so CARTO is out entirely.
 *
 * Esri's `Canvas/World_*_Gray_Base` services are the replacement: keyless,
 * generously usable, and also a matched light/dark pair. They ship with a
 * separate transparent `Reference` layer carrying the place labels, which is
 * what lets the dark map keep readable names — the usual reason a dark basemap
 * ends up unusable for locating anything.
 *
 * Two traps specific to Esri:
 *   1. The URL template is `{z}/{y}/{x}` — row before column. Leaflet
 *      substitutes named placeholders, so writing `{x}/{y}` here silently
 *      requests the wrong tile of a valid-looking map.
 *   2. The Canvas services stop at z16. z17 and beyond answer 200 with a
 *      2.5 KB blank, so an over-large `maxZoom` shows empty grey at the moment
 *      a user zooms in to read a street.
 *
 * `NEXT_PUBLIC_MAP_TILE_URL` overrides the base imagery. It exists so that a
 * provider change is a Vercel environment variable rather than a deploy.
 */

export type MapTheme = 'light' | 'dark'

export type TileSource = {
  readonly url: string
  /**
   * A transparent label-only overlay drawn above the base.
   *
   * Omitted when a source has no separate label service. Rendering it as a
   * second tile layer rather than baking labels into the base is what makes the
   * light and dark maps agree on place names.
   */
  readonly labelsUrl?: string
  readonly attribution: string
  /**
   * Only used when the URL template contains `{s}`.
   *
   * Esri does not shard, so this is inert for the built-in sources — but it is
   * kept so that a sharded provider supplied through the environment override
   * still works without a code change.
   */
  readonly subdomains: readonly string[]
  readonly maxZoom: number
}

const ESRI_ATTRIBUTION =
  'Tiles &copy; <a href="https://www.esri.com/">Esri</a> — Esri, HERE, Garmin, &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

const ESRI_BASE = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas'

/** Leaflet's default subdomain set, used when a source does not shard. */
export const DEFAULT_SUBDOMAINS: readonly string[] = ['a', 'b', 'c']

/** Empirically the highest zoom Esri's Canvas services serve; see the header. */
export const ESRI_MAX_ZOOM = 16

export const TILE_SOURCES: Record<MapTheme, TileSource> = {
  light: {
    url: `${ESRI_BASE}/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`,
    labelsUrl: `${ESRI_BASE}/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}`,
    attribution: ESRI_ATTRIBUTION,
    subdomains: DEFAULT_SUBDOMAINS,
    maxZoom: ESRI_MAX_ZOOM,
  },
  dark: {
    url: `${ESRI_BASE}/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`,
    labelsUrl: `${ESRI_BASE}/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`,
    attribution: ESRI_ATTRIBUTION,
    subdomains: DEFAULT_SUBDOMAINS,
    maxZoom: ESRI_MAX_ZOOM,
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
 * The override replaces the base imagery only. Attribution stays with the
 * theme, because dropping it would breach the terms of whichever provider is in
 * use — and the label overlay is dropped, because a custom base will not line
 * up with Esri's place names and drawing foreign labels on someone else's map
 * is worse than drawing none.
 */
export function tileSourceFor(theme: unknown): TileSource {
  const source = TILE_SOURCES[normalizeTheme(theme)]
  const override = process.env.NEXT_PUBLIC_MAP_TILE_URL?.trim()
  return override ? { ...source, url: override, labelsUrl: undefined } : source
}
