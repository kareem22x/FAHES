/**
 * Where the map should be looking, derived from what is on it.
 *
 * This is a pure function rather than a `useEffect` inside the map because the
 * decision has three cases that Leaflet cannot distinguish on its own, and two
 * of them are wrong if you just hand it bounds:
 *
 *   1. No markers. There is nothing to fit. Calling `fitBounds` on an empty
 *      `LatLngBounds` throws in Leaflet, and "fit the whole world" is not a
 *      useful answer either — the caller shows an empty state instead.
 *
 *   2. One marker, or several stacked on the same spot. Bounds with zero area
 *      make Leaflet zoom to its maximum, so a single inspector in Dammam is
 *      rendered as a photograph of one rooftop. This case needs a fixed zoom.
 *
 *   3. A real spread. Bounds, and let Leaflet pick the zoom.
 *
 * The distinction between (2) and (3) is the reason this is not a one-liner:
 * `min === max` on either axis is the test, and it is easy to miss that a set
 * of ten markers can still be case 2.
 */

import { plottableMarkers, type MapMarker } from './types'

/** Leaflet's `[lat, lng]` order, which is not the order coordinates are written in. */
export type LatLngTuple = [number, number]

export type MapView =
  | { kind: 'empty' }
  | { kind: 'point'; center: LatLngTuple; zoom: number }
  | { kind: 'bounds'; bounds: [LatLngTuple, LatLngTuple] }

/** Neighbourhood scale: close enough to read streets, wide enough for context. */
export const SINGLE_POINT_ZOOM = 13

/**
 * Fallback view for an empty map.
 *
 * The Eastern Province, which is the only region this product serves. Kept here
 * so both maps open on the same place rather than one defaulting to the whole
 * planet.
 */
export const HOME_CENTER: LatLngTuple = [26.42, 50.09]
export const HOME_ZOOM = 9

export function viewFor(markers: ReadonlyArray<MapMarker>): MapView {
  const points = plottableMarkers(markers)
  if (points.length === 0) return { kind: 'empty' }

  let south = points[0].latitude
  let north = points[0].latitude
  let west = points[0].longitude
  let east = points[0].longitude

  for (const point of points) {
    if (point.latitude < south) south = point.latitude
    if (point.latitude > north) north = point.latitude
    if (point.longitude < west) west = point.longitude
    if (point.longitude > east) east = point.longitude
  }

  // Zero extent on *both* axes means every marker is the same place. A single
  // differing marker anywhere makes this a genuine bounds fit.
  if (south === north && west === east) {
    return { kind: 'point', center: [south, west], zoom: SINGLE_POINT_ZOOM }
  }

  return {
    kind: 'bounds',
    bounds: [
      [south, west],
      [north, east],
    ],
  }
}
