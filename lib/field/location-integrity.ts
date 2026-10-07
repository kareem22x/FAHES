/**
 * Deciding whether a reported fix can be believed.
 *
 * ── Why this is server-side ────────────────────────────────────────────────
 * `inspector_locations.is_mock_location` already exists and already raises a
 * violation, but nothing ever set it: the column was wired to a flag no client
 * could honestly compute. The browser's Geolocation API does not expose whether
 * a position was injected, so a client that reported `true` would be guessing
 * and a client that reported `false` would be lying. Either way the map's
 * "موقع مزيف" indicator would be decoration.
 *
 * The server *can* check something the device cannot fake by itself: whether the
 * new fix is reachable from the previous one. Two signals, both cheap, both
 * derived from data already stored.
 *
 * ── What this deliberately does not do ─────────────────────────────────────
 * It does not claim to detect a good spoof. A rooted device reporting a
 * stationary position in the right city produces a perfectly plausible fix, and
 * no amount of arithmetic here would catch it — that needs the device-integrity
 * attestation the field app already collects separately. This module catches the
 * careless case and says so, rather than implying a guarantee it cannot make.
 */

import { distanceMeters } from './geo'

export type LocationFix = {
  latitude: number
  longitude: number
  /** Metres, as reported by the device. `null` when the browser withheld it. */
  accuracy: number | null
  recordedAtMs: number
}

export type IntegrityReason = 'impossible_speed' | 'implausible_accuracy'

export type IntegrityVerdict = {
  mock: boolean
  reason: IntegrityReason | null
}

/**
 * Faster than any road vehicle, and well above the inter-city average in the
 * Eastern Province — Dammam to Jubail is about 78 km and takes the better part
 * of an hour. Anything above this between two consecutive fixes is a jump, not a
 * journey.
 */
export const MAX_PLAUSIBLE_SPEED_KMH = 200

/**
 * A real GPS receiver never reports a perfect fix.
 *
 * Consumer chips resolve to a few metres at best, and a genuinely excellent fix
 * still reads 3–5 m. An accuracy of exactly zero means the number did not come
 * from the chip — it is what a mock-location provider or a hand-written
 * coordinate pair produces. Negative values are nonsense for the same reason.
 */
export function isImplausibleAccuracy(accuracy: number | null): boolean {
  return accuracy !== null && accuracy <= 0
}

/**
 * Assesses a fix against the one before it.
 *
 * `previous` is `null` on an inspector's first report, which is not suspicious:
 * there is nothing to compare against, so the verdict is clean and the speed
 * check is skipped rather than guessed at.
 */
export function assessFix(current: LocationFix, previous: LocationFix | null): IntegrityVerdict {
  if (isImplausibleAccuracy(current.accuracy)) {
    return { mock: true, reason: 'implausible_accuracy' }
  }

  if (!previous) return { mock: false, reason: null }

  const elapsedMs = current.recordedAtMs - previous.recordedAtMs
  // A replayed or out-of-order report carries no usable time delta. Skipping is
  // the honest answer: dividing by zero would flag every such report, and a
  // negative delta would flag every clock that drifted.
  if (elapsedMs <= 0) return { mock: false, reason: null }

  const metres = distanceMeters(
    previous.latitude,
    previous.longitude,
    current.latitude,
    current.longitude,
  )
  const speedKmh = (metres / elapsedMs) * 3_600

  if (speedKmh > MAX_PLAUSIBLE_SPEED_KMH) {
    return { mock: true, reason: 'impossible_speed' }
  }

  return { mock: false, reason: null }
}

/** Implied speed between two fixes, in km/h. `null` when it cannot be computed. */
export function impliedSpeedKmh(previous: LocationFix, current: LocationFix): number | null {
  const elapsedMs = current.recordedAtMs - previous.recordedAtMs
  if (elapsedMs <= 0) return null
  const metres = distanceMeters(previous.latitude, previous.longitude, current.latitude, current.longitude)
  return (metres / elapsedMs) * 3_600
}
