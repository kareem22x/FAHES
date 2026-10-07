/**
 * The vocabulary the two maps share.
 *
 * The admin console plots inspectors and the field surface plots orders. They
 * are the same picture seen from opposite ends of one workflow, so they agree
 * on what a marker is. Defining the shape here rather than inside either
 * component is what stops the two drifting into subtly different markers.
 *
 * Everything in this module is pure: no DOM, no Leaflet, no React. That is what
 * makes it testable — `vitest.config.mjs` only collects `lib/**\/*.test.ts`.
 */

/**
 * The colour families a marker may carry.
 *
 * Deliberately closed. A marker's tone is the only thing that decides its
 * colour, and the colour itself lives in `app/leaflet-map.css` keyed on
 * `data-tone` — so a tone added here without a matching rule there renders as
 * an unstyled pin rather than silently borrowing a neighbour's colour.
 */
export type MapTone = 'good' | 'warn' | 'bad' | 'neutral' | 'info'

export const MAP_TONES: readonly MapTone[] = ['good', 'warn', 'bad', 'neutral', 'info']

/**
 * A point to plot.
 *
 * `id` must be stable across refreshes. Leaflet keys its layer registry on it,
 * and a regenerated id (a fresh `Math.random()`, or an index into a re-sorted
 * list) makes every marker unmount and remount on each poll — which shows up as
 * flicker and as closed popups springing back open.
 */
export type MapMarker = {
  id: string
  latitude: number
  longitude: number
  tone: MapTone
  /**
   * A single character drawn inside the pin.
   *
   * Static by design: the pin's markup is handed to Leaflet as an HTML string,
   * so it is the one place in these components where React cannot escape text
   * for us. Nothing derived from the database goes in here — titles, names and
   * coordinates all render through `<Popup>`, which is real React and escapes
   * on its own.
   */
  glyph?: string
  title: string
  subtitle?: string
  /** Rows shown in the popup body. */
  details?: ReadonlyArray<{ label: string; value: string }>
  /** Draws a pulsing halo: "active right now". */
  pulse?: boolean
  /** Draws a warning ring: "this fix is not to be trusted". */
  flagged?: boolean
}

/** True when the value is a usable WGS-84 pair. */
export function isPlottable(value: {
  latitude: number
  longitude: number
}): boolean {
  return (
    Number.isFinite(value.latitude) &&
    Number.isFinite(value.longitude) &&
    value.latitude >= -90 &&
    value.latitude <= 90 &&
    value.longitude >= -180 &&
    value.longitude <= 180
  )
}

/** Drops anything that cannot be plotted. Never throws. */
export function plottableMarkers(markers: ReadonlyArray<MapMarker>): MapMarker[] {
  return markers.filter(isPlottable)
}
